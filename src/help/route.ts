import type { createInterface } from "node:readline"
import config from "./config.ts"
import { normalize } from "./text.ts"

export async function routeInput(
  text: string,
  wakeLines: ReturnType<typeof createInterface>,
  speak: (text: string, wakeLines: ReturnType<typeof createInterface>) => Promise<void>
): Promise<void> {
  const normalized = normalize(text)

  if (normalized.includes("time")) {
    const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    const response = `The time is ${time}`
    console.log("🕒", response)
    await speak(response, wakeLines)
    return
  }

  const query = text.trim()
  console.log("🔍 Asking assistant:", query)

  try {
    const prompt = `System: ${config.llm.style}\nUser: ${query}\nAssistant:`
    const response = await fetch(config.llm.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        n_predict: 96,
        temperature: 0.1,
        top_p: 0.9,
        repeat_penalty: 1.1,
        stop: ["\nUser:", "\nSystem:"],
      }),
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`LLM HTTP ${response.status}: ${body}`)
    }
    const data = (await response.json()) as { content?: string }
    const answer = cleanResponse(data.content ?? "")
    console.log("🤖 Response:", answer)
    await speak(answer, wakeLines)
  } catch (err) {
    console.error("Assistant request failed:", (err as Error).message)
    const msg = "Ugh, try again later."
    console.log("🤖", msg)
    await speak(msg, wakeLines)
  }
}

export function cleanResponse(text: string): string {
  let output = text.replace(/^\s*[?\-:,.\s]+/, "").trim()
  if (!output) return "I didn't get a solid answer yet."

  const sentences = output.match(/[^.!?]+[.!?]?/g) ?? [output]
  output = sentences.slice(0, 2).join(" ").trim()

  if (output.length > 260) {
    output = `${output.slice(0, 257).trimEnd()}...`
  }

  return output
}
