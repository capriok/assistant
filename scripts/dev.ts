// Starts the full voice stack for suitey: the llama model server and the
// assistant HTTP API. Ctrl-C stops everything this script started.
//
// If something is already listening on LLAMA_PORT, it is reused instead of
// starting a second copy of the model.

import { type ChildProcess, spawn } from "node:child_process"
import { connect } from "node:net"

const LLAMA_HOST = process.env.LLAMA_HOST ?? "127.0.0.1"
const LLAMA_PORT = Number(process.env.LLAMA_PORT ?? "8000")

type Service = { name: string; color: string; script: string }

const services: Service[] = [
  { name: "llama", color: "\x1b[35m", script: "src/llama-server.ts" },
  { name: "http", color: "\x1b[36m", script: "src/assistant-server.ts" },
]

const running: { service: Service; proc: ChildProcess }[] = []
let shuttingDown = false

function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

function pipeWithPrefix(
  stream: NodeJS.ReadableStream | null,
  prefix: string,
  out: NodeJS.WriteStream
) {
  if (!stream) return
  let buffer = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    buffer += chunk
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) out.write(`${prefix}${line}\n`)
  })
  stream.on("end", () => {
    if (buffer) out.write(`${prefix}${buffer}\n`)
  })
}

function start(service: Service) {
  // detached: own process group, so stopping it also stops grandchildren
  // (llama-server.ts spawns the llama.cpp binary and does not forward signals).
  const proc = spawn("bun", [service.script], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
  })
  const prefix = `${service.color}[${service.name}]\x1b[0m `
  pipeWithPrefix(proc.stdout, prefix, process.stdout)
  pipeWithPrefix(proc.stderr, prefix, process.stderr)

  proc.on("exit", (code, signal) => {
    if (shuttingDown) return
    console.error(`${prefix}exited (${signal ?? `code ${code}`}), stopping the rest`)
    shutdown(code ?? 1)
  })

  running.push({ service, proc })
}

function killGroup(proc: ChildProcess, signal: NodeJS.Signals) {
  if (proc.pid === undefined) return
  try {
    process.kill(-proc.pid, signal)
  } catch {
    // group already gone
  }
}

// The group outlives its leader when the leader is a wrapper (llama-server.ts),
// so check the whole group rather than the direct child.
function groupAlive(proc: ChildProcess): boolean {
  if (proc.pid === undefined) return false
  try {
    process.kill(-proc.pid, 0)
    return true
  } catch {
    return false
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const { proc } of running) killGroup(proc, "SIGTERM")

  const deadline = Date.now() + 5000
  const timer = setInterval(() => {
    const alive = running.filter(({ proc }) => groupAlive(proc))
    if (alive.length > 0 && Date.now() < deadline) return
    for (const { proc } of alive) killGroup(proc, "SIGKILL")
    clearInterval(timer)
    process.exit(exitCode)
  }, 100)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

const llamaUp = await isListening(LLAMA_HOST, LLAMA_PORT)
for (const service of services) {
  if (service.name === "llama" && llamaUp) {
    console.log(
      `${service.color}[llama]\x1b[0m already running on ${LLAMA_HOST}:${LLAMA_PORT}, reusing it`
    )
    continue
  }
  start(service)
}

// llama.cpp's /health returns 200 once the model is loaded (503 while loading).
async function waitForModel() {
  const url = `http://${LLAMA_HOST}:${LLAMA_PORT}/health`
  while (!shuttingDown) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // not listening yet
    }
    await Bun.sleep(1000)
  }
  return false
}

if (await waitForModel()) {
  const port = process.env.ASSISTANT_HTTP_PORT ?? "3001"
  console.log(`\x1b[32m[dev]\x1b[0m voice stack ready: http://localhost:${port}/chat`)
}
