import { execFile, spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const WHISPER = "./whisper.cpp/build/bin/whisper-cli"
const MODEL = "./whisper.cpp/models/ggml-base.en.bin"
const LLM_ENDPOINT = "http://localhost:8000/completion"

const LLM_STYLE = [
  "You are a concise voice assistant.",
  "Answer in 1-2 short sentences.",
  "No preamble, no uncertainty unless necessary.",
  "Prefer direct factual answers.",
].join(" ")
const TTS_RATE = process.env.TTS_RATE ?? "240"
const TTS_VOICE = process.env.TTS_VOICE ?? "Moira"

const INPUT_FILE = `/tmp/assistant-input-${process.pid}.wav`
const INTERRUPT_FILE = `/tmp/assistant-interrupt-${process.pid}.wav`
let useManualWake = false

async function main() {
  const wakeLines = spawnWakeSidecar()

  while (true) {
    console.log("👂 Listening for wake word...")
    await waitForWake(wakeLines)

    console.log("🟢 Wake word detected!")
    console.log("🎙 Speak your command...")
    await recordUntilSilence(INPUT_FILE)

    console.log("🧠 Transcribing command...")
    const transcript = await transcribe(INPUT_FILE)
    safeUnlink(INPUT_FILE)

    if (transcript) {
      console.log("🗣 You said:", transcript)
      await routeInput(transcript, wakeLines)
    } else {
      console.log("⚠️ Nothing detected.")
    }

    console.log("--------------------------------")
  }
}

main().catch(console.error)

function spawnWakeSidecar() {
  const proc = spawn("python3", ["wake.py"], { stdio: ["ignore", "pipe", "inherit"] })
  const lines = createInterface({ input: proc.stdout! })

  proc.on("error", (err) => {
    console.error("Failed to start wake sidecar:", err.message)
    console.error("Falling back to manual trigger mode.")
    useManualWake = true
    lines.emit("line", "WAKE_DETECTED")
  })

  proc.on("close", (code) => {
    console.error(`wake.py exited with code ${code}`)
    console.error("Falling back to manual trigger mode.")
    useManualWake = true
    lines.emit("line", "WAKE_DETECTED")
  })

  return lines
}

function waitForWake(lines: ReturnType<typeof createInterface>): Promise<void> {
  if (useManualWake) {
    return waitForManualWake()
  }

  return new Promise((resolve) => {
    const handler = (line: string) => {
      if (line.trim() === "WAKE_DETECTED") {
        lines.off("line", handler)
        resolve()
      }
    }
    lines.on("line", handler)
  })
}

function waitForManualWake(): Promise<void> {
  return new Promise((resolve) => {
    console.log("⌨️ Press Enter to start speaking...")
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question("", () => {
      rl.close()
      resolve()
    })
  })
}

async function speak(text: string, wakeLines: ReturnType<typeof createInterface>) {
  const sayProc = spawn("say", ["-v", TTS_VOICE, "-r", TTS_RATE, text], {
    stdio: ["ignore", "ignore", "inherit"],
  })
  let wasInterrupted = false
  let interruptTask: Promise<void> | null = null
  let handlerAttached = false

  if (!useManualWake) {
    const handler = (line: string) => {
      if (line.trim() !== "WAKE_DETECTED" || interruptTask) return

      interruptTask = (async () => {
        wasInterrupted = true
        console.log("🛑 Wake detected during response.")
        sayProc.kill("SIGTERM")
        console.log("🎙 Say 'stop' to cancel, or a new question to continue.")
        await recordUntilSilence(INTERRUPT_FILE)
        const interruptTranscript = await transcribe(INTERRUPT_FILE)
        safeUnlink(INTERRUPT_FILE)
        const normalized = normalize(interruptTranscript)

        if (isStopCommand(normalized)) {
          console.log("🛑 Stopped.")
          return
        }

        if (interruptTranscript.trim()) {
          console.log("↪️ Continuing with:", interruptTranscript)
          await routeInput(interruptTranscript, wakeLines)
        }
      })().catch((err) => {
        console.error("Interrupt handling error:", (err as Error).message)
      })
    }

    wakeLines.on("line", handler)
    handlerAttached = true

    try {
      await new Promise<void>((resolve, reject) => {
        sayProc.on("error", reject)
        sayProc.on("close", (code) => {
          if (code === 0 || wasInterrupted) {
            resolve()
            return
          }
          reject(new Error(`say exited with ${code}`))
        })
      })
    } catch (err) {
      console.error("TTS error:", (err as Error).message)
    } finally {
      if (handlerAttached) {
        wakeLines.off("line", handler)
      }
      if (interruptTask) {
        await interruptTask
      }
    }

    return
  }

  try {
    await new Promise<void>((resolve, reject) => {
      sayProc.on("error", reject)
      sayProc.on("close", (code) => {
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(`say exited with ${code}`))
      })
    })
  } catch (err) {
    console.error("TTS error:", (err as Error).message)
  }
}

async function routeInput(text: string, wakeLines: ReturnType<typeof createInterface>) {
  const normalized = normalize(text)

  console.log("🤖 I heard:", text)

  if (normalized.includes("time")) {
    const now = new Date().toLocaleTimeString()
    const response = `The time is ${now}`
    console.log("🕒", response)
    await speak(response, wakeLines)
    return
  }

  const query = text.trim()
  console.log("🔍 Asking assistant:", query)

  try {
    const prompt = `System: ${LLM_STYLE}\nUser: ${query}\nAssistant:`
    const response = await fetch(LLM_ENDPOINT, {
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
  } catch {
    const msg = "Uh oh, something went wrong."
    console.log("🤖", msg)
    await speak(msg, wakeLines)
  }
}

function cleanResponse(text: string): string {
  let output = text.replace(/^\s*[?\-:,.\s]+/, "").trim()
  if (!output) return "I didn't get a solid answer yet."

  const sentences = output.match(/[^.!?]+[.!?]?/g) ?? [output]
  output = sentences.slice(0, 2).join(" ").trim()

  if (output.length > 260) {
    output = `${output.slice(0, 257).trimEnd()}...`
  }

  return output
}

function recordUntilSilence(filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sox = spawn(
      "sox",
      ["-d", "-r", "16000", "-c", "1", filename, "silence", "1", "0.1", "1%", "1", "1.0", "1%"],
      { stdio: "ignore" }
    )

    sox.on("close", () => resolve())
    sox.on("error", reject)
  })
}

async function transcribe(filename: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(WHISPER, ["-f", filename, "-m", MODEL, "-nt"])
    return stdout.trim()
  } catch (err) {
    console.error("Transcription error:", err)
    return ""
  }
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim()
}

function isStopCommand(text: string): boolean {
  return (
    text === "stop" ||
    text.includes(" stop") ||
    text.includes("cancel") ||
    text.includes("quiet") ||
    text.includes("shut up")
  )
}

function safeUnlink(path: string) {
  const rm = spawn("rm", ["-f", path], { stdio: "ignore" })
  rm.on("error", () => {})
}
