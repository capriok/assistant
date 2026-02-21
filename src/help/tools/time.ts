import type { AssistantTool } from "./.types.ts"

export const timeTool: AssistantTool = {
  id: "time",
  rules: [
    { type: "exact", value: "what time is it" },
    { type: "regex", pattern: "\\b(?:what(?:'s| is)?\\s+)?time\\b" },
    { type: "contains", value: "time" },
  ],
  run: () => {
    const time = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
    return `The time is ${time}`
  },
}
