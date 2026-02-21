import type { AssistantTool, ToolContext } from "./.types.ts"

export const onlineTool: AssistantTool = {
  id: "online",
  rules: [{ type: "exact", value: "search online for <query>" }],
  run: (ctx: ToolContext) => {
    return `Not implemented.`
  },
}
