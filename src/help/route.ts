import type { createInterface } from "node:readline"
import type { AssistantContext, AssistantReply } from "./actions.ts"
import { buildChatPrompt, requestCompletion } from "./llm.ts"
import { selectToolMatches } from "./matcher.ts"
import { normalize } from "./text.ts"
import { TOOLS } from "./tools/index.ts"
import type { ToolContext } from "./types.ts"

/**
 * Text in, reply out. No TTS or readline. Used by the HTTP API.
 * `context` is data from the caller (e.g. the user's lists) that tools may use;
 * any `actions` in the reply are for the caller to execute.
 */
export async function processInput(
  text: string,
  context?: AssistantContext
): Promise<AssistantReply> {
  const normalized = normalize(text)
  const ctx: ToolContext = {
    rawInput: text,
    normalizedInput: normalized,
    context,
  }

  // Try each tool whose rules match, in order. A tool returning null means
  // "not for me after all" (e.g. "delete the Costco list" reaches the list
  // tool before the list-item tool), so the next one gets a turn, then chat.
  for (const { tool } of selectToolMatches(TOOLS, ctx)) {
    try {
      const result = await tool.run(ctx)
      if (result === null) continue
      const reply =
        typeof result === "string"
          ? { response: result, actions: [] }
          : { response: result.response, actions: result.actions ?? [] }
      reply.response = reply.response.trim() || "I matched a tool, but it returned no answer."
      return reply
    } catch (err) {
      console.error(`Tool ${tool.id} failed:`, (err as Error).message)
      return { response: "That tool failed. Try again.", actions: [] }
    }
  }

  const query = text.trim()
  try {
    const prompt = buildChatPrompt(query)
    return { response: cleanResponse(await requestCompletion(prompt)), actions: [] }
  } catch (err) {
    console.error("Assistant request failed:", (err as Error).message)
    return { response: "Ugh, try again later.", actions: [] }
  }
}

export async function routeInput(
  text: string,
  wakeLines: ReturnType<typeof createInterface>,
  speak: (text: string, wakeLines: ReturnType<typeof createInterface>) => Promise<void>
): Promise<void> {
  // The wake-word CLI has no app context, so tools that need it explain that
  // and return no actions.
  const { response } = await processInput(text)
  console.log("🤖 Response:", response)
  await speak(response, wakeLines)
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
