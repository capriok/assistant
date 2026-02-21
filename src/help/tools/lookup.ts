import { lookupWithOpenAI } from "../openai.ts"
import type { AssistantTool, ToolContext } from "../types.ts"

function extractLookupQuery(rawInput: string): string {
  const value = rawInput.trim()
  if (!value) return ""

  const patterns = [/^lookup\s+(.+)$/i, /^look\s+up\s+(.+)$/i, /^search\s+online\s+for\s+(.+)$/i]

  for (const pattern of patterns) {
    const match = value.match(pattern)
    const query = match?.[1]?.trim()
    if (query) return query
  }

  return ""
}

export const lookupTool: AssistantTool = {
  id: "lookup",
  rules: [
    { type: "exact", value: "lookup <query>" },
    { type: "exact", value: "look up <query>" },
    { type: "exact", value: "search for <query>" },
  ],
  run: async (ctx: ToolContext) => {
    const query = extractLookupQuery(ctx.rawInput)
    if (!query) {
      return 'Say "lookup <query>" or "look up <query>" or "search for <query>".'
    }

    try {
      return await lookupWithOpenAI(query)
    } catch (error) {
      const message = (error as Error).message
      if (message.includes("OPENAI_API_KEY is not set")) {
        return "OPENAI_API_KEY is missing. Add it to your .env and try again."
      }

      console.error("Lookup failed:", message)
      return "I couldn't complete the online lookup right now. Try again in a moment."
    }
  },
}
