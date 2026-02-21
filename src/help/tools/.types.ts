export type ToolContext = {
  rawInput: string
  normalizedInput: string
}

export type RuleSource = "normalized" | "raw"

type MatchRuleBase = {
  source?: RuleSource
  weight?: number
}

type StringMatchRuleBase = MatchRuleBase & {
  caseSensitive?: boolean
}

export type ExactMatchRule = StringMatchRuleBase & {
  type: "exact"
  value: string
}

export type StartsWithMatchRule = StringMatchRuleBase & {
  type: "startsWith"
  value: string
}

export type EndsWithMatchRule = StringMatchRuleBase & {
  type: "endsWith"
  value: string
}

export type ContainsMatchRule = StringMatchRuleBase & {
  type: "contains"
  value: string
}

export type RegexMatchRule = MatchRuleBase & {
  type: "regex"
  pattern: string
  flags?: string
}

export type AnyOfMatchRule = MatchRuleBase & {
  type: "anyOf"
  rules: MatchRule[]
}

export type PredicateMatchRule = MatchRuleBase & {
  type: "predicate"
  test: (ctx: ToolContext) => boolean
}

export type MatchRule =
  | ExactMatchRule
  | StartsWithMatchRule
  | EndsWithMatchRule
  | ContainsMatchRule
  | RegexMatchRule
  | AnyOfMatchRule
  | PredicateMatchRule

export type AssistantTool = {
  id: string
  // Standard contract: prefer declarative rules + optional priority.
  // Use exact for strict commands, contains for broad intent, regex for NL variants.
  // Keep predicate for advanced cases that rules cannot express cleanly.
  rules?: MatchRule[]
  priority?: number
  // Temporary migration fallback. Prefer rules instead.
  match?: (text: string, ctx?: ToolContext) => boolean
  run: (ctx: ToolContext) => Promise<string> | string
}
