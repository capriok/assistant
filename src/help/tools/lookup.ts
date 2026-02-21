import type { AssistantTool, ToolContext } from "./.types.ts"

export const lookupTool: AssistantTool = {
  id: "lookup",
  rules: [{ type: "exact", value: "lookup" }],
  run: (ctx: ToolContext) => {
    const normalizedInput = ctx.normalizedInput.replace("lookup ", "").trim()
    console.log(`Looking up ${normalizedInput}`)

    return `Not implemented.`
  },
}
