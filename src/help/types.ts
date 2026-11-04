import type { AssistantContext, ToolResult } from "./actions.ts"

export type ToolContext = {
  rawInput: string
  normalizedInput: string
  /** Data the caller (e.g. Suitey) sent along, such as the user's lists. */
  context?: AssistantContext
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

export type ToolOutput = string | ToolResult | null

export type AssistantTool = {
  id: string
  rules: MatchRule[]
  /**
   * A plain string is spoken as-is; a ToolResult can also carry actions.
   * null means "not for me after all" and the request falls through to chat.
   */
  run: (ctx: ToolContext) => Promise<ToolOutput> | ToolOutput
}
