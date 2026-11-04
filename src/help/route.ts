import type { createInterface } from "node:readline"
import { buildChatPrompt, requestCompletion } from "./llm.ts"
import { selectToolMatch } from "./matcher.ts"
import { normalize } from "./text.ts"
import { TOOLS } from "./tools/index.ts"
import type { ToolContext } from "./types.ts"

/** Text-in, text-out. No TTS or readline. Use for HTTP API. */
export async function processInput(text: string): Promise<string> {
  const normalized = normalize(text)
  const ctx: ToolContext = {
    rawInput: text,
    normalizedInput: normalized,
  }

  const toolMatch = selectToolMatch(TOOLS, ctx)
  const tool = toolMatch?.tool
  if (tool && toolMatch) {
    try {
      const answer = (await tool.run(ctx)).trim()
      if (answer) {
        return answer
      }
      return "I matched a tool, but it returned no answer."
    } catch (err) {
      console.error(`Tool ${tool.id} failed:`, (err as Error).message)
      return "That tool failed. Try again."
    }
  }

  const query = text.trim()
  try {
    const prompt = buildChatPrompt(query)
    return cleanResponse(await requestCompletion(prompt))
  } catch (err) {
    console.error("Assistant request failed:", (err as Error).message)
    return "Ugh, try again later."
  }
}

export async function routeInput(
  text: string,
  wakeLines: ReturnType<typeof createInterface>,
  speak: (text: string, wakeLines: ReturnType<typeof createInterface>) => Promise<void>
): Promise<void> {
  const answer = await processInput(text)
  console.log("🤖 Response:", answer)
  await speak(answer, wakeLines)
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
