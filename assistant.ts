import { execFile, spawn } from "child_process"
import { createInterface } from "readline"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

const WHISPER = "./whisper.cpp/build/bin/whisper-cli"
const MODEL = "./whisper.cpp/models/ggml-base.en.bin"

const INPUT_FILE = "input.wav"

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

function spawnWakeSidecar() {
  const proc = spawn("python3", ["wake.py"], { stdio: ["ignore", "pipe", "inherit"] })

  proc.on("error", (err) => {
    console.error("Failed to start wake sidecar:", err.message)
    process.exit(1)
  })

  proc.on("close", (code) => {
    console.error(`wake.py exited with code ${code}`)
    process.exit(1)
  })

  return createInterface({ input: proc.stdout! })
}

function waitForWake(lines: ReturnType<typeof createInterface>): Promise<void> {
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

async function speak(text: string) {
  try {
    await execFileAsync("bash", ["speak.sh", text])
  } catch (err) {
    console.error("TTS error:", (err as Error).message)
  }
}

async function routeInput(text: string) {
  const normalized = normalize(text)

  console.log("🤖 I heard:", text)

  if (normalized.includes("time")) {
    const now = new Date().toLocaleTimeString()
    const response = `The time is ${now}`
    console.log("🕒", response)
    await speak(response)
    return
  }

  const query = normalized.trim()
  console.log("🔍 Asking assistant:", query)

  try {
    const response = await fetch("http://localhost:8000/completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: query, n_predict: 200, temperature: 0.2 }),
    })
    const data = (await response.json()) as { content: string }
    console.log("🤖 Response:", data.content)
    await speak(data.content)
  } catch {
    const msg = "Uh oh, something went wrong."
    console.log("🤖", msg)
    await speak(msg)
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
    const { stdout } = await execFileAsync(WHISPER, ["-f", filename, "-m", MODEL, "-nt", "-of", "txt"])
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
