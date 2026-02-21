import type { createInterface } from "node:readline"
import { buildChatPrompt, requestCompletion } from "./llm.ts"
import { normalize } from "./text.ts"
import type { ToolContext } from "./tools/.types.ts"
import { TOOLS } from "./tools/index.ts"
import { formatMatchedRule, selectToolMatch } from "./tools/matcher.ts"

export async function routeInput(
  text: string,
  wakeLines: ReturnType<typeof createInterface>,
  speak: (text: string, wakeLines: ReturnType<typeof createInterface>) => Promise<void>
): Promise<void> {
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
        console.log(`🔧 Tool: ${tool.id} (score=${toolMatch.score}, rule=${formatMatchedRule(toolMatch.matchedRule)})`)
        console.log("🤖 Response:", answer)
        await speak(answer, wakeLines)
      } else {
        const msg = "I matched a tool, but it returned no answer."
        console.log(`🔧 Tool: ${tool.id} (score=${toolMatch.score}, rule=${formatMatchedRule(toolMatch.matchedRule)})`)
        console.log("🤖", msg)
        await speak(msg, wakeLines)
      }
    } catch (err) {
      console.error(`Tool ${tool.id} failed:`, (err as Error).message)
      const msg = "That tool failed. Try again."
      console.log("🤖", msg)
      await speak(msg, wakeLines)
    }
    return
  }

  const query = text.trim()
  console.log("🔍 Asking assistant:", query)

  try {
    const prompt = buildChatPrompt(query)
    const answer = cleanResponse(await requestCompletion(prompt))
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
