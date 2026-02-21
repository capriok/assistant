import type { AssistantTool } from "../types.ts"

export const timeTool: AssistantTool = {
  id: "time",
  rules: [
    { type: "exact", value: "what time is it" },
    { type: "exact", value: "whats the time" },
    { type: "exact", value: "tell me the time" },
  ],
  run: () => {
    const time = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
    return `The time is ${time}`
  },
}
