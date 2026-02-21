import type { AssistantTool, MatchRule, ToolContext } from "./.types.ts"

const BASE_RULE_SCORES = {
  exact: 100,
  regex: 80,
  startsWith: 70,
  endsWith: 70,
  contains: 60,
  predicate: 50,
} as const

const LEGACY_MATCH_SCORE = 40
const DEFAULT_REGEX_FLAGS = "i"
const warnedLegacyTools = new Set<string>()

type MatchResult = {
  matched: boolean
  score: number
  matchedRule: MatchRule | null
}

export type ToolSelection = {
  tool: AssistantTool
  score: number
  matchedRule: MatchRule | "legacy"
  priority: number
  index: number
}

function getRuleInput(ctx: ToolContext, source: "normalized" | "raw" = "normalized"): string {
  return source === "raw" ? ctx.rawInput : ctx.normalizedInput
}

function normalizeStringValue(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase()
}

function evalStringRule(
  type: "exact" | "startsWith" | "endsWith" | "contains",
  value: string,
  ctx: ToolContext,
  rule: MatchRule
): MatchResult {
  const input = getRuleInput(ctx, rule.source)
  const caseSensitive = "caseSensitive" in rule ? (rule.caseSensitive ?? false) : false
  const lhs = normalizeStringValue(input, caseSensitive)
  const rhs = normalizeStringValue(value, caseSensitive)

  let matched = false
  if (type === "exact") matched = lhs === rhs
  if (type === "startsWith") matched = lhs.startsWith(rhs)
  if (type === "endsWith") matched = lhs.endsWith(rhs)
  if (type === "contains") matched = lhs.includes(rhs)

  return {
    matched,
    score: matched ? BASE_RULE_SCORES[type] + (rule.weight ?? 0) : Number.NEGATIVE_INFINITY,
    matchedRule: matched ? rule : null,
  }
}

function evalRule(rule: MatchRule, ctx: ToolContext): MatchResult {
  switch (rule.type) {
    case "exact":
      return evalStringRule("exact", rule.value, ctx, rule)
    case "startsWith":
      return evalStringRule("startsWith", rule.value, ctx, rule)
    case "endsWith":
      return evalStringRule("endsWith", rule.value, ctx, rule)
    case "contains":
      return evalStringRule("contains", rule.value, ctx, rule)
    case "regex": {
      const input = getRuleInput(ctx, rule.source)
      try {
        const re = new RegExp(rule.pattern, rule.flags ?? DEFAULT_REGEX_FLAGS)
        const matched = re.test(input)
        return {
          matched,
          score: matched ? BASE_RULE_SCORES.regex + (rule.weight ?? 0) : Number.NEGATIVE_INFINITY,
          matchedRule: matched ? rule : null,
        }
      } catch (error) {
        console.error(`Invalid regex rule "${rule.pattern}":`, (error as Error).message)
        return { matched: false, score: Number.NEGATIVE_INFINITY, matchedRule: null }
      }
    }
    case "predicate": {
      const matched = rule.test(ctx)
      return {
        matched,
        score: matched ? BASE_RULE_SCORES.predicate + (rule.weight ?? 0) : Number.NEGATIVE_INFINITY,
        matchedRule: matched ? rule : null,
      }
    }
    case "anyOf": {
      let bestScore = Number.NEGATIVE_INFINITY
      let bestRule: MatchRule | null = null
      let matched = false
      for (const childRule of rule.rules) {
        const result = evalRule(childRule, ctx)
        if (result.matched) {
          matched = true
          if (result.score > bestScore) {
            bestScore = result.score
            bestRule = result.matchedRule
          }
        }
      }
      return {
        matched,
        score: matched ? bestScore + (rule.weight ?? 0) : Number.NEGATIVE_INFINITY,
        matchedRule: matched ? bestRule : null,
      }
    }
  }
}

function evaluateTool(tool: AssistantTool, ctx: ToolContext, index: number): ToolSelection | null {
  let bestRuleScore = Number.NEGATIVE_INFINITY
  let bestMatchedRule: MatchRule | "legacy" | null = null

  if (tool.rules?.length) {
    for (const rule of tool.rules) {
      const result = evalRule(rule, ctx)
      if (result.matched && result.score > bestRuleScore) {
        bestRuleScore = result.score
        bestMatchedRule = result.matchedRule
      }
    }
  }

  if (bestRuleScore > Number.NEGATIVE_INFINITY && bestMatchedRule) {
    return {
      tool,
      score: bestRuleScore,
      matchedRule: bestMatchedRule,
      priority: tool.priority ?? 0,
      index,
    }
  }

  if (tool.match?.(ctx.normalizedInput, ctx)) {
    if (!warnedLegacyTools.has(tool.id)) {
      warnedLegacyTools.add(tool.id)
      console.warn(`Tool "${tool.id}" is using deprecated match(). Migrate to rules.`)
    }
    return {
      tool,
      score: LEGACY_MATCH_SCORE,
      matchedRule: "legacy",
      priority: tool.priority ?? 0,
      index,
    }
  }

  return null
}

export function selectTool(tools: AssistantTool[], ctx: ToolContext): AssistantTool | null {
  return selectToolMatch(tools, ctx)?.tool ?? null
}

export function selectToolMatch(tools: AssistantTool[], ctx: ToolContext): ToolSelection | null {
  const matches: ToolSelection[] = []
  for (const [index, tool] of tools.entries()) {
    const toolMatch = evaluateTool(tool, ctx, index)
    if (toolMatch) matches.push(toolMatch)
  }

  if (matches.length === 0) return null

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.priority !== a.priority) return b.priority - a.priority
    return a.index - b.index
  })

  return matches[0] ?? null
}

export function formatMatchedRule(rule: MatchRule | "legacy"): string {
  if (rule === "legacy") return "legacy match()"
  switch (rule.type) {
    case "exact":
    case "startsWith":
    case "endsWith":
    case "contains":
      return `${rule.type}("${rule.value}")`
    case "regex":
      return `regex(/${rule.pattern}/${rule.flags ?? DEFAULT_REGEX_FLAGS})`
    case "predicate":
      return "predicate(test)"
    case "anyOf":
      return "anyOf(...)"
  }
}
