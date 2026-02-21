import { buildChatPrompt, requestCompletion } from "../llm.ts"
import type { AssistantTool } from "./.types.ts"

export const jokeTool: AssistantTool = {
  id: "joke",
  match: (text) => {
    const words = ["joke", "funny", "make me laugh"]
    return words.some((word) => text.includes(word))
  },
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
