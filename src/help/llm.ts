import config from "./config.ts"

type LlmCompletionOptions = {
  nPredict?: number
  temperature?: number
  topP?: number
  repeatPenalty?: number
  stop?: string[]
}

export function buildChatPrompt(userText: string, systemStyle = config.llm.style): string {
  return `System: ${systemStyle}\nUser: ${userText}\nAssistant:`
}

export async function requestCompletion(
  prompt: string,
  options: LlmCompletionOptions = {}
): Promise<string> {
  const response = await fetch(config.llm.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      n_predict: options.nPredict ?? 96,
      temperature: options.temperature ?? 0.1,
      top_p: options.topP ?? 0.9,
      repeat_penalty: options.repeatPenalty ?? 1.1,
      stop: options.stop ?? ["\nUser:", "\nSystem:"],
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LLM HTTP ${response.status}: ${body}`)
  }

  const data = (await response.json()) as { content?: string }
  return data.content?.trim() ?? ""
}
