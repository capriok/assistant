export type ToolContext = {
  rawInput: string
  normalizedInput: string
}

export type AssistantTool = {
  id: string
  match: (text: string, ctx?: ToolContext) => boolean
  run: (ctx: ToolContext) => Promise<string> | string
}
