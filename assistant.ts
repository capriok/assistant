import { execFile, spawn } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

const WHISPER = "./whisper.cpp/build/bin/whisper-cli"
const MODEL = "./whisper.cpp/models/ggml-base.en.bin"

const WAKE_FILE = "wake.wav"
const INPUT_FILE = "input.wav"

const WAKE_TOKENS = ["hey", "sweetie"]

async function main() {
  while (true) {
    await listenForWake()

    console.log("🎙 Speak your command...")
    await recordUntilSilence(INPUT_FILE)

    console.log("🧠 Transcribing command...")
    const transcript = await transcribe(INPUT_FILE)

    if (transcript) {
      console.log("🗣 You said:", transcript)
      await routeInput(transcript)
    } else {
      console.log("⚠️ Nothing detected.")
    }

    console.log("--------------------------------")
  }
}

main().catch(console.error)

async function routeInput(text: string) {
  const normalized = normalize(text)

  console.log("🤖 I heard:", text)

  if (normalized.includes("time")) {
    const now = new Date().toLocaleTimeString()
    console.log("🕒 The time is", now)
    return
  }

  const query = normalized.trim()
  console.log("🔍 Searching the web for:", query)

  await fetch(`http://localhost:8000/completion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: query,
      n_predict: 200,
      temperature: 0.2,
    }),
  })
    .then((response) => response.json())
    .then((data: any) => {
      console.log("🤖 Response:", data.content)
    })
    .catch((error) => {
      // console.error("🤖 Error:", error.message)
      console.log("🤖 Uh oh, something went wrong.")
    })

  return
}

function recordFixed(seconds: number, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sox = spawn(
      "sox",
      ["-d", "-r", "16000", "-c", "1", filename, "trim", "0", String(seconds)],
      { stdio: "ignore" }
    )

    sox.on("close", () => resolve())
    sox.on("error", reject)
  })
}

async function listenForWake() {
  console.log("👂 Listening for wake word...")

  while (true) {
    await recordFixed(3, WAKE_FILE)

    const text = await transcribe(WAKE_FILE)
    if (text) {
      console.log("DEBUG:", text)
    }

    if (wakeDetected(text)) {
      console.log("🟢 Wake word detected!")
      return
    }

    await sleep(200)
  }
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
    const { stdout } = await execFileAsync(WHISPER, [
      "-f",
      filename,
      "-m",
      MODEL,
      "-nt",
      "-of",
      "txt",
    ])

    return stdout.trim()
  } catch (err) {
    console.error("Transcription error:", err)
    return ""
  }
}

function wakeDetected(text: string): boolean {
  const normalized = normalize(text)
  const tokens = normalized.split(/\s+/)
  return WAKE_TOKENS.every((t) => tokens.includes(t))
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
