// Building blocks for tools that turn speech into app actions (list items now;
// events, schedules, lists, ... later). A typical tool:
//
//   1. extractJson(): one model call, output constrained to a JSON Schema,
//      returning every operation in the request.
//   2. Resolve each operation against the app context with nameMentioned()
//      and bestMatches(), producing an Outcome (what to say, what to do).
//   3. combineOutcomes() into the reply, or return null to fall through to chat.

import type { AssistantAction, ToolResult } from "../actions.ts"
import { requestCompletion } from "../llm.ts"
import { normalize } from "../text.ts"

/** "a", "a and b", "a, b and c" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Trim and drop trailing sentence punctuation from model/speech text. */
export const cleanSpoken = (value: string) => value.trim().replace(/[.!?]+$/, "")

const DEFAULT_FILLER = new Set(["list", "lists", "the", "my", "a", "an", "of", "and"])

/**
 * Whether the user actually said this name. Guards against the model filling
 * in a default when they only said "my list". Words match on a shared prefix
 * so "groceries" matches "Grocery List".
 */
export function nameMentioned(text: string, name: string, filler = DEFAULT_FILLER): boolean {
  const said = normalize(text).split(/\s+/)
  const nameWords = normalize(name)
    .split(/\s+/)
    .filter((w) => w && !filler.has(w))
  return nameWords.some((w) => {
    const need = Math.min(4, w.length)
    return said.some((s) => s.length >= need && s.slice(0, need) === w.slice(0, need))
  })
}

/**
 * Stricter than nameMentioned: every meaningful word of the name was said.
 * For things whose names often share a word ("Gym" vs "Gym bag"), so one
 * shared word doesn't pick the wrong one.
 */
export function nameFullyMentioned(text: string, name: string, filler = DEFAULT_FILLER): boolean {
  const said = normalize(text).split(/\s+/)
  const nameWords = normalize(name)
    .split(/\s+/)
    .filter((w) => w && !filler.has(w))
  return (
    nameWords.length > 0 &&
    nameWords.every((w) => {
      const need = Math.min(4, w.length)
      return said.some((s) => s.length >= need && s.slice(0, need) === w.slice(0, need))
    })
  )
}

function singular(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

/** 3 exact, 2 same ignoring case and plurals, 1 whole-word containment, 0 none. */
export function matchScore(spoken: string, name: string): number {
  const a = normalize(spoken)
  const b = normalize(name)
  if (!a || !b) return 0
  if (a === b) return 3
  const sa = a.split(/\s+/).map(singular).join(" ")
  const sb = b.split(/\s+/).map(singular).join(" ")
  if (sa === sb) return 2
  if (` ${sb} `.includes(` ${sa} `) || ` ${sa} `.includes(` ${sb} `)) return 1
  return 0
}

/** The candidates whose name best matches what was said (ties all returned). */
export function bestMatches<T>(
  candidates: Iterable<T>,
  spoken: string,
  nameOf: (c: T) => string
): T[] {
  let best = 0
  let found: T[] = []
  for (const candidate of candidates) {
    const score = matchScore(spoken, nameOf(candidate))
    if (score === 0 || score < best) continue
    if (score > best) {
      best = score
      found = []
    }
    found.push(candidate)
  }
  return found
}

/** A JSON Schema string enum of names plus a "none" sentinel. */
export const enumWithNone = (names: string[], none = "none") => ({
  type: "string",
  enum: [...new Set(names), none],
})

type ExtractOptions = {
  /** Fixed instructions. Kept first so llama.cpp can reuse its cached prefix. */
  instructions: string
  /** Per-request data (the user's lists, events, ...). */
  data: string
  /** What the user said. */
  input: string
  schema: Record<string, unknown>
  maxTokens?: number
}

/** One deterministic model call whose output must match `schema`. */
export async function extractJson<T>({
  instructions,
  data,
  input,
  schema,
  maxTokens = 256,
}: ExtractOptions): Promise<T> {
  const prompt = `System: ${instructions}\n\n${data}\nUser: ${input}\nAssistant:`
  const raw = await requestCompletion(prompt, {
    jsonSchema: schema,
    nPredict: maxTokens,
    temperature: 0,
    stop: [],
  })
  return JSON.parse(raw) as T
}

/** One resolved operation: what to say and, if anything, what to do. */
export type Outcome = {
  response: string
  action?: AssistantAction
  /**
   * Outcomes sharing a key are said as one sentence at the first one's
   * position: `say(joinNames(parts))`, e.g. "Added milk, bread and 3 apples to Costco."
   */
  merge?: { key: string; part: string; say: (parts: string) => string }
}

/** Build the tool reply from outcomes, merging similar sentences. */
export function combineOutcomes(outcomes: Outcome[]): ToolResult {
  const sentences: string[] = []
  const groups = new Map<string, { index: number; parts: string[]; say: (p: string) => string }>()

  for (const o of outcomes) {
    if (!o.merge) {
      sentences.push(o.response)
      continue
    }
    const group = groups.get(o.merge.key)
    if (group) {
      group.parts.push(o.merge.part)
    } else {
      groups.set(o.merge.key, { index: sentences.length, parts: [o.merge.part], say: o.merge.say })
      sentences.push("")
    }
  }
  for (const g of groups.values()) sentences[g.index] = g.say(joinNames(g.parts))

  return {
    response: sentences.join(" "),
    actions: outcomes.flatMap((o) => (o.action ? [o.action] : [])),
  }
}
