import { execFile, spawn, spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { createInterface } from "node:readline"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const WHISPER = "./packages/whisper.cpp/build/bin/whisper-cli"
const DEFAULT_WHISPER_MODEL = "./packages/whisper.cpp/models/ggml-base.en.bin"
const MODEL = process.env.WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL
const WHISPER_NO_GPU = parseBooleanEnv(process.env.WHISPER_NO_GPU, false)
const LLM_ENDPOINT = "http://localhost:8000/completion"

const LLM_STYLE = [
  "You are a concise voice assistant.",
  "Answer in 1-2 short sentences.",
  "No preamble, no uncertainty unless necessary.",
  "Prefer direct factual answers.",
].join(" ")
const TTS_RATE = process.env.TTS_RATE ?? "240"
const TTS_VOICE = process.env.TTS_VOICE ?? "Moira"
const WAKE_ACK_TEXT = process.env.WAKE_ACK_TEXT ?? "hello"
const TTS_COMMAND = process.env.TTS_COMMAND?.trim() ?? ""
const COMMAND_NO_SPEECH_TIMEOUT_MS = parseTimeoutMs(
  process.env.COMMAND_NO_SPEECH_TIMEOUT_MS ?? process.env.COMMAND_TIMEOUT_MS,
  8000
)
const INTERRUPT_NO_SPEECH_TIMEOUT_MS = parseTimeoutMs(
  process.env.INTERRUPT_NO_SPEECH_TIMEOUT_MS ?? process.env.INTERRUPT_TIMEOUT_MS,
  5000
)
const COMMAND_END_SILENCE_MS = parseTimeoutMs(process.env.COMMAND_END_SILENCE_MS, 1200)
const INTERRUPT_END_SILENCE_MS = parseTimeoutMs(process.env.INTERRUPT_END_SILENCE_MS, 900)
const COMMAND_MAX_CAPTURE_MS = parseTimeoutMs(process.env.COMMAND_MAX_CAPTURE_MS, 12000)
const INTERRUPT_MAX_CAPTURE_MS = parseTimeoutMs(process.env.INTERRUPT_MAX_CAPTURE_MS, 8000)
const COMMAND_SILENCE_LEVEL = parseSoxSilenceLevel(process.env.COMMAND_SILENCE_LEVEL, "2.0%")
const INTERRUPT_SILENCE_LEVEL = parseSoxSilenceLevel(process.env.INTERRUPT_SILENCE_LEVEL, "2.5%")

const INPUT_FILE = `/tmp/assistant-input-${process.pid}.wav`
const INTERRUPT_FILE = `/tmp/assistant-interrupt-${process.pid}.wav`
const WAKE_SIDECAR_PATH = new URL("./assistant-sidecar.py", import.meta.url).pathname
let useManualWake = false
let wakeProc: ReturnType<typeof spawn> | null = null
const tts = resolveTtsConfig()

function installShutdownHandlers() {
  const shutdown = () => {
    if (wakeProc && !wakeProc.killed) {
      wakeProc.kill("SIGTERM")
    }
  }

  process.on("SIGINT", () => {
    shutdown()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    shutdown()
    process.exit(0)
  })
}

async function main() {
  installShutdownHandlers()
  const wakeLines = spawnWakeSidecar()

  while (true) {
    console.log("👂 Listening for wake word...")
    await waitForWake(wakeLines)

    console.log("🟢 Wake word detected!")
    playWakeAckNonBlocking()

    console.log("🎙 Speak your command...")
    const heardCommand = await recordUntilSilence(
      INPUT_FILE,
      COMMAND_NO_SPEECH_TIMEOUT_MS,
      COMMAND_END_SILENCE_MS,
      COMMAND_MAX_CAPTURE_MS,
      COMMAND_SILENCE_LEVEL
    )
    if (!heardCommand) {
      safeUnlink(INPUT_FILE)
      console.log("⏱️ Command timed out. Returning to wake listening.")
      console.log("--------------------------------")
      continue
    }

    console.log("🧠 Transcribing command...")
    const transcript = await transcribe(INPUT_FILE)
    safeUnlink(INPUT_FILE)

    // if equals WAKE_ACK_TEXT (case insensitive, a-z only), continue
    if (
      normalizeAlpha(transcript) &&
      normalizeAlpha(transcript) === normalizeAlpha(WAKE_ACK_TEXT)
    ) {
      sleep(2500)
      console.log("🔍 Wake word detected. Continuing...")
      continue
    }

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function spawnWakeSidecar() {
  const proc = spawn("python3", [WAKE_SIDECAR_PATH], {
    stdio: ["ignore", "pipe", "inherit"],
  })
  wakeProc = proc
  const stdout = proc.stdout
  if (!stdout) {
    console.error("Wake sidecar started without stdout pipe.")
    console.error("Falling back to manual trigger mode.")
    useManualWake = true
    const fallback = createInterface({ input: process.stdin, output: process.stdout })
    queueMicrotask(() => fallback.emit("line", "WAKE_DETECTED"))
    return fallback
  }

  const lines = createInterface({ input: stdout })

  proc.on("error", (err) => {
    console.error("Failed to start wake sidecar:", err.message)
    console.error("Falling back to manual trigger mode.")
    useManualWake = true
    lines.emit("line", "WAKE_DETECTED")
  })

  proc.on("close", (code) => {
    console.error(`assistant-sidecar.py exited with code ${code}`)
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
  if (!tts) {
    console.log("🔇 TTS unavailable:", text)
    return
  }

  const sayProc = spawn(tts.command, tts.args(text), {
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
        console.log("🛑 Wake word detected during TTS. Interrupting...")
        sayProc.kill("SIGTERM")
        console.log("🎙 Speak your next command...")
        const heardInterrupt = await recordUntilSilence(
          INTERRUPT_FILE,
          INTERRUPT_NO_SPEECH_TIMEOUT_MS,
          INTERRUPT_END_SILENCE_MS,
          INTERRUPT_MAX_CAPTURE_MS,
          INTERRUPT_SILENCE_LEVEL
        )
        if (!heardInterrupt) {
          safeUnlink(INTERRUPT_FILE)
          console.log("⏱️ Interrupt capture timed out.")
          return
        }
        const interruptTranscript = await transcribe(INTERRUPT_FILE)
        safeUnlink(INTERRUPT_FILE)

        if (interruptTranscript.trim()) {
          console.log("↪️ Continuing with:", interruptTranscript)
          await routeInput(interruptTranscript, wakeLines)
          return
        }

        console.log("⚠️ No interrupt command detected.")
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
          reject(new Error(`${tts.command} exited with ${code}`))
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
        reject(new Error(`${tts.command} exited with ${code}`))
      })
    })
  } catch (err) {
    console.error("TTS error:", (err as Error).message)
  }
}

async function routeInput(text: string, wakeLines: ReturnType<typeof createInterface>) {
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
  } catch (err) {
    console.error("Assistant request failed:", (err as Error).message)
    const msg = "Ugh, try again later."
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

function recordUntilSilence(
  filename: string,
  noSpeechTimeoutMs: number,
  endSilenceMs: number,
  maxCaptureMs: number,
  silenceLevel: string
): Promise<boolean> {
  const endSilenceSeconds = (endSilenceMs / 1000).toFixed(2)

  return new Promise((resolve, reject) => {
    const sox = spawn(
      "sox",
      [
        "-d",
        "-r",
        "16000",
        "-c",
        "1",
        filename,
        "silence",
        "1",
        "0.08",
        silenceLevel,
        "1",
        endSilenceSeconds,
        silenceLevel,
      ],
      { stdio: "ignore" }
    )

    let noSpeechTimedOut = false
    let maxCaptureReached = false
    let heardSpeech = false

    const poll = setInterval(() => {
      if (!existsSync(filename)) return
      const size = statSync(filename).size
      if (size > 44) {
        heardSpeech = true
      }
    }, 150)

    const timer = setTimeout(() => {
      if (!heardSpeech) {
        noSpeechTimedOut = true
        sox.kill("SIGTERM")
      }
    }, noSpeechTimeoutMs)

    const maxCaptureTimer = setTimeout(() => {
      if (sox.killed) return
      maxCaptureReached = true
      sox.kill("SIGTERM")
    }, maxCaptureMs)

    sox.on("close", () => {
      clearInterval(poll)
      clearTimeout(timer)
      clearTimeout(maxCaptureTimer)
      if (maxCaptureReached && heardSpeech) {
        console.log("⏱️ Max capture reached; processing what was heard.")
      }
      if (!heardSpeech) {
        resolve(false)
        return
      }
      if (noSpeechTimedOut) {
        resolve(false)
        return
      }
      resolve(true)
    })
    sox.on("error", (err) => {
      clearInterval(poll)
      clearTimeout(timer)
      clearTimeout(maxCaptureTimer)
      reject(err)
    })
  })
}

async function transcribe(filename: string): Promise<string> {
  const args = ["-f", filename, "-m", MODEL, "-nt"]
  if (WHISPER_NO_GPU) {
    args.push("-ng")
  }

  try {
    const { stdout } = await execFileAsync(WHISPER, args)
    return stdout.trim()
  } catch (err) {
    const message = String((err as { message?: string })?.message ?? "")
    const stderr = String((err as { stderr?: string })?.stderr ?? "")

    if (message.includes("ENOENT") && message.includes(WHISPER)) {
      console.error(`Whisper binary not found at ${WHISPER}. Run: bun run build:whisper`)
      return ""
    }
    if (stderr.includes("failed to open") && stderr.includes(MODEL)) {
      console.error(
        `Whisper model not found at ${MODEL}. Run: ./packages/whisper.cpp/models/download-ggml-model.sh base.en`
      )
      return ""
    }

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

function normalizeAlpha(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "")
}

function safeUnlink(path: string) {
  const rm = spawn("rm", ["-f", path], { stdio: "ignore" })
  rm.on("error", () => {})
}

function playWakeAckNonBlocking() {
  const text = WAKE_ACK_TEXT.trim()
  if (!text || !tts) return

  const sayProc = spawn(tts.command, tts.args(text), {
    stdio: ["ignore", "ignore", "ignore"],
  })
  sayProc.on("error", () => {})
}

type TtsConfig = {
  command: string
  args: (text: string) => string[]
}

function resolveTtsConfig(): TtsConfig | null {
  if (TTS_COMMAND) {
    if (commandExists(TTS_COMMAND)) {
      return {
        command: TTS_COMMAND,
        args: (text: string) => [text],
      }
    }
    console.error(`Configured TTS_COMMAND not found in PATH: ${TTS_COMMAND}`)
  }

  if (process.platform === "darwin" && commandExists("say")) {
    return {
      command: "say",
      args: (text: string) => ["-v", TTS_VOICE, "-r", TTS_RATE, text],
    }
  }

  if (process.platform === "linux" && commandExists("espeak")) {
    return {
      command: "espeak",
      args: (text: string) => {
        const args = ["-s", TTS_RATE]
        if (TTS_VOICE && TTS_VOICE !== "Moira") {
          args.push("-v", TTS_VOICE)
        }
        args.push(text)
        return args
      },
    }
  }

  if (process.platform === "linux" && commandExists("spd-say")) {
    return {
      command: "spd-say",
      args: (text: string) => [text],
    }
  }

  console.error(
    "No supported TTS command found. Install 'say' (macOS), 'espeak' or 'spd-say' (Linux), or set TTS_COMMAND."
  )
  return null
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${shellEscape(command)} >/dev/null 2>&1`], {
    stdio: "ignore",
  })
  return result.status === 0
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function parseTimeoutMs(input: string | undefined, fallback: number): number {
  const n = Number(input)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }
  return Math.round(n)
}

function parseBooleanEnv(input: string | undefined, fallback: boolean): boolean {
  if (!input) return fallback
  const normalized = input.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function parseSoxSilenceLevel(input: string | undefined, fallback: string): string {
  if (!input) return fallback
  const value = input.trim().toLowerCase()
  if (/^-?\d+(\.\d+)?(%|d)$/.test(value)) {
    return value
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    return `${value}%`
  }
  return fallback
}
