import type { AssistantTool } from "./.types.ts"

export const timeTool: AssistantTool = {
  id: "time",
  match: (text) => text.includes("time"),
  run: () => {
    const time = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
    return `The time is ${time}`
  },
}
