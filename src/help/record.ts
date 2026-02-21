import { execFile, spawn } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { promisify } from "node:util"
import config from "./config.ts"

const execFileAsync = promisify(execFile)

type RecordConfig = {
  noSpeechTimeoutMs: number
  endSilenceMs: number
  maxCaptureMs: number
  silenceLevel: string
}

function recordUntilSilence(filename: string, recordConfig: RecordConfig): Promise<boolean> {
  const endSilenceSeconds = (recordConfig.endSilenceMs / 1000).toFixed(2)

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
        recordConfig.silenceLevel,
        "1",
        endSilenceSeconds,
        recordConfig.silenceLevel,
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
    }, recordConfig.noSpeechTimeoutMs)

    const maxCaptureTimer = setTimeout(() => {
      if (sox.killed) return
      maxCaptureReached = true
      sox.kill("SIGTERM")
    }, recordConfig.maxCaptureMs)

    sox.on("close", () => {
      clearInterval(poll)
      clearTimeout(timer)
      clearTimeout(maxCaptureTimer)
      if (maxCaptureReached && heardSpeech) {
        console.log("⏱️ Max capture reached; processing what was heard.")
      }
      if (!heardSpeech || noSpeechTimedOut) {
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

export function recordCommandUntilSilence(): Promise<boolean> {
  return recordUntilSilence(config.files.input, {
    noSpeechTimeoutMs: config.capture.commandNoSpeechTimeoutMs,
    endSilenceMs: config.capture.commandEndSilenceMs,
    maxCaptureMs: config.capture.commandMaxCaptureMs,
    silenceLevel: config.capture.commandSilenceLevel,
  })
}

export function recordInterruptUntilSilence(): Promise<boolean> {
  return recordUntilSilence(config.files.interrupt, {
    noSpeechTimeoutMs: config.capture.interruptNoSpeechTimeoutMs,
    endSilenceMs: config.capture.interruptEndSilenceMs,
    maxCaptureMs: config.capture.interruptMaxCaptureMs,
    silenceLevel: config.capture.interruptSilenceLevel,
  })
}

export async function transcribe(filename: string): Promise<string> {
  const args = ["-f", filename, "-m", config.whisper.modelPath, "-nt"]
  if (config.whisper.noGpu) {
    args.push("-ng")
  }

  try {
    const { stdout } = await execFileAsync(config.whisper.path, args)
    return stdout.trim()
  } catch (err) {
    const message = String((err as { message?: string })?.message ?? "")
    const stderr = String((err as { stderr?: string })?.stderr ?? "")

    if (message.includes("ENOENT") && message.includes(config.whisper.path)) {
      console.error(
        `Whisper binary not found at ${config.whisper.path}. Run: bun run build:whisper`
      )
      return ""
    }
    if (stderr.includes("failed to open") && stderr.includes(config.whisper.modelPath)) {
      console.error(
        `Whisper model not found at ${config.whisper.modelPath}. Run: ./packages/whisper.cpp/models/download-ggml-model.sh base.en`
      )
      return ""
    }

    console.error("Transcription error:", err)
    return ""
  }
}
