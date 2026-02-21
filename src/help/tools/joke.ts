import { buildChatPrompt, requestCompletion } from "../llm.ts"
import type { AssistantTool } from "../types.ts"

export const jokeTool: AssistantTool = {
  id: "joke",
  rules: [
    { type: "exact", value: "tell me a joke" },
    { type: "exact", value: "make me laugh" },
    { type: "contains", value: "joke" },
    { type: "contains", value: "funny" },
    { type: "regex", pattern: "\\bmake me laugh\\b" },
  ],
  run: async () => {
    const prompt = buildChatPrompt("Tell one short, adult explicit joke. Plain text only.")
    const joke = await requestCompletion(prompt, {
      nPredict: 64,
      temperature: 0.9,
      topP: 0.95,
      repeatPenalty: 1.1,
    })
    if (!joke) {
      throw new Error("LLM returned empty joke content")
    }

    return joke
  },
}
