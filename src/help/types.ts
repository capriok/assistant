export type ToolContext = {
  rawInput: string
  normalizedInput: string
}

export type RuleSource = "normalized" | "raw"

type StringMatchRuleBase = {
  source?: RuleSource
  caseSensitive?: boolean
}

export type ExactMatchRule = StringMatchRuleBase & {
  type: "exact"
  value: string
}

export type ContainsMatchRule = StringMatchRuleBase & {
  type: "contains"
  value: string
}

export type RegexMatchRule = {
  type: "regex"
  pattern: string
  flags?: string
  source?: RuleSource
}

export type MatchRule = ExactMatchRule | ContainsMatchRule | RegexMatchRule

export type AssistantTool = {
  id: string
  rules: MatchRule[]
  run: (ctx: ToolContext) => Promise<string> | string
}
