// llama-server prints hundreds of lines while loading a model and several per
// request. This keeps what's useful in a dev terminal and drops the rest:
//
//   loading <model>…
//   ready on http://127.0.0.1:8000 (8.2s)
//   request: 214 new prompt tokens in 0.4s, 38 reply tokens in 0.8s
//   (tokens already in llama.cpp's prompt cache aren't re-read, so aren't counted)
//   anything that looks like an error
//
// Set LLAMA_LOG=full to see llama-server's own output instead.

export type LogState = {
  startedAt: number
  /** Prompt tokens and time for the request in progress. */
  prompt?: { tokens: number; ms: number }
}

export const newLogState = (now = Date.now()): LogState => ({ startedAt: now })

const ERROR = /\b(error|failed|abort|assert|exceeds|out of memory|cannot|unable)\b/i
// Errors llama-server reports that are routine, not problems. The Metal
// assert fires while freeing GPU memory on shutdown, after all work is done.
const ROUTINE =
  /no remote preset found|HEAD failed, status: 404|tensor API disabled|rsets->data count/i

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const num = (n: number) => n.toLocaleString("en-US")

/** One line of llama-server output → what to print, or null to drop it. */
export function summarizeLine(raw: string, state: LogState, now = Date.now()): string | null {
  const line = raw.trim()
  if (!line) return null

  const loading = line.match(/load_model: loading model '.*\/([^/']+)'/)
  if (loading) return `loading ${loading[1]}…`

  const listening = line.match(/server is listening on (\S+)/)
  if (listening) return `ready on ${listening[1]} (${secs(now - state.startedAt)})`

  const prompt = line.match(/prompt eval time =\s*([\d.]+) ms \/\s*(\d+) tokens/)
  if (prompt) {
    state.prompt = { ms: Number(prompt[1]), tokens: Number(prompt[2]) }
    return null
  }

  const reply = line.match(/^eval time =\s*([\d.]+) ms \/\s*(\d+) tokens/)
  if (reply) {
    const p = state.prompt
    const promptPart = p ? `${num(p.tokens)} new prompt tokens in ${secs(p.ms)}` : "prompt"
    state.prompt = undefined
    return `request: ${promptPart}, ${num(Number(reply[2]))} reply tokens in ${secs(Number(reply[1]))}`
  }

  // Non-200 responses are worth seeing.
  const done = line.match(/done request: (\S+ \S+) \S+ (\d{3})/)
  if (done && done[2] !== "200") return `request failed: ${done[1]} → ${done[2]}`

  if (ERROR.test(line) && !ROUTINE.test(line)) return line

  return null
}
