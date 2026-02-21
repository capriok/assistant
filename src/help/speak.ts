import { spawn } from "node:child_process"
import type { createInterface } from "node:readline"
import config from "./config.ts"
import { recordInterruptUntilSilence } from "./record.ts"
import { commandExists, safeUnlink } from "./system.ts"

export type TtsConfig = {
  command: string
  args: (text: string) => string[]
}

export function resolveTtsConfig(): TtsConfig | null {
  if (config.tts.command) {
    if (commandExists(config.tts.command)) {
      return {
        command: config.tts.command,
        args: (text: string) => [text],
      }
    }
    console.error(`Configured TTS_COMMAND not found in PATH: ${config.tts.command}`)
  }

  if (process.platform === "darwin" && commandExists("say")) {
    return {
      command: "say",
      args: (text: string) => ["-v", config.tts.voice, "-r", config.tts.rate, text],
    }
  }

  if (process.platform === "linux" && commandExists("espeak")) {
    return {
      command: "espeak",
      args: (text: string) => {
        const args = ["-s", config.tts.rate]
        if (config.tts.voice && config.tts.voice !== "Moira") {
          args.push("-v", config.tts.voice)
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

export function playWakeAckNonBlocking(tts: TtsConfig | null): void {
  const text = config.tts.wakeAckText.trim()
  if (!text || !tts) return

  const sayProc = spawn(tts.command, tts.args(text), {
    stdio: ["ignore", "ignore", "ignore"],
  })
  sayProc.on("error", () => {})
}

export type SpeakDeps = {
  tts: TtsConfig | null
  isManualWake: () => boolean
  transcribe: (filename: string) => Promise<string>
  routeInput: (text: string, wakeLines: ReturnType<typeof createInterface>) => Promise<void>
}

export function createSpeak(deps: SpeakDeps) {
  return async function speak(
    text: string,
    wakeLines: ReturnType<typeof createInterface>
  ): Promise<void> {
    if (!deps.tts) {
      console.log("🔇 TTS unavailable:", text)
      return
    }

    const sayProc = spawn(deps.tts.command, deps.tts.args(text), {
      stdio: ["ignore", "ignore", "inherit"],
    })
    let wasInterrupted = false
    let interruptTask: Promise<void> | null = null
    let handlerAttached = false

    if (!deps.isManualWake()) {
      const handler = (line: string) => {
        if (line.trim() !== "WAKE_DETECTED" || interruptTask) return

        interruptTask = (async () => {
          wasInterrupted = true
          console.log("🛑 Wake word detected during TTS. Interrupting...")
          sayProc.kill("SIGTERM")
          console.log("🎙 Speak your next command...")
          const heardInterrupt = await recordInterruptUntilSilence()
          if (!heardInterrupt) {
            safeUnlink(config.files.interrupt)
            console.log("⏱️ Interrupt capture timed out.")
            return
          }
          const interruptTranscript = await deps.transcribe(config.files.interrupt)
          safeUnlink(config.files.interrupt)

          if (interruptTranscript.trim()) {
            console.log("↪️ Continuing with:", interruptTranscript)
            await deps.routeInput(interruptTranscript, wakeLines)
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
            reject(new Error(`${deps.tts?.command} exited with ${code}`))
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
          reject(new Error(`${deps.tts?.command} exited with ${code}`))
        })
      })
    } catch (err) {
      console.error("TTS error:", (err as Error).message)
    }
  }
}
