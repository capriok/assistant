import type { AssistantTool, MatchRule, ToolContext } from "./.types.ts"

const DEFAULT_REGEX_FLAGS = "i"
const warnedInvalidPatterns = new Set<string>()

export type ToolSelection = {
  tool: AssistantTool
  matchedRule: MatchRule
}

function getRuleInput(ctx: ToolContext, source: "normalized" | "raw" = "normalized"): string {
  return source === "raw" ? ctx.rawInput : ctx.normalizedInput
}

function normalizeStringValue(value: string, caseSensitive: boolean): string {
  return caseSensitive ? value : value.toLowerCase()
}

function matchesStringRule(
  type: "exact" | "contains",
  value: string,
  ctx: ToolContext,
  rule: MatchRule
): boolean {
  const input = getRuleInput(ctx, rule.source)
  const caseSensitive = "caseSensitive" in rule ? (rule.caseSensitive ?? false) : false
  const lhs = normalizeStringValue(input, caseSensitive)
  const rhs = normalizeStringValue(value, caseSensitive)

  if (type === "exact") return lhs === rhs
  return lhs.includes(rhs)
}

function matchesRule(rule: MatchRule, ctx: ToolContext): boolean {
  switch (rule.type) {
    case "exact":
      return matchesStringRule("exact", rule.value, ctx, rule)
    case "contains":
      return matchesStringRule("contains", rule.value, ctx, rule)
    case "regex": {
      const input = getRuleInput(ctx, rule.source)
      try {
        const re = new RegExp(rule.pattern, rule.flags ?? DEFAULT_REGEX_FLAGS)
        return re.test(input)
      } catch (error) {
        const key = `${rule.pattern}/${rule.flags ?? DEFAULT_REGEX_FLAGS}`
        if (!warnedInvalidPatterns.has(key)) {
          warnedInvalidPatterns.add(key)
          console.error(`Invalid regex rule "${rule.pattern}":`, (error as Error).message)
        }
        return false
      }
    }
  }
}

export function selectTool(tools: AssistantTool[], ctx: ToolContext): AssistantTool | null {
  return selectToolMatch(tools, ctx)?.tool ?? null
}

export function selectToolMatch(tools: AssistantTool[], ctx: ToolContext): ToolSelection | null {
  for (const tool of tools) {
    for (const rule of tool.rules) {
      if (matchesRule(rule, ctx)) return { tool, matchedRule: rule }
    }
  }
  return null
}

export function formatMatchedRule(rule: MatchRule): string {
  switch (rule.type) {
    case "exact":
    case "contains":
      return `${rule.type}("${rule.value}")`
    case "regex":
      return `regex(/${rule.pattern}/${rule.flags ?? DEFAULT_REGEX_FLAGS})`
  }
}
