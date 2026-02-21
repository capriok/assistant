import config from "./help/config.ts"
import { recordCommandUntilSilence, transcribe } from "./help/record.ts"
import { routeInput } from "./help/route.ts"
import { createSpeak, playWakeAckNonBlocking, resolveTtsConfig } from "./help/speak.ts"
import { safeUnlink } from "./help/system.ts"
import { normalizeAlpha } from "./help/text.ts"
import { installShutdownHandlers, spawnWakeSidecar, waitForWake } from "./help/wake.ts"

const wakeState = {
  useManualWake: false,
  wakeProc: null,
}
const tts = resolveTtsConfig()

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  installShutdownHandlers(wakeState)
  const wakeLines = spawnWakeSidecar(config.wake.sidecarPath, wakeState)

  let routeInputWithDeps: (text: string, lines?: typeof wakeLines) => Promise<void>
  const speakWithDeps = createSpeak({
    tts,
    isManualWake: () => wakeState.useManualWake,
    transcribe,
    routeInput: async (text, lines) => routeInputWithDeps(text, lines),
  })

  routeInputWithDeps = async (text: string, lines = wakeLines): Promise<void> => {
    await routeInput(text, lines, speakWithDeps)
  }

  while (true) {
    console.log("👂 Listening for wake word...")
    await waitForWake(wakeLines, wakeState)

    console.log("🟢 Wake word detected!")
    playWakeAckNonBlocking(tts)

    console.log("🎙 Speak your command...")
    const heardCommand = await recordCommandUntilSilence()
    if (!heardCommand) {
      safeUnlink(config.files.input)
      console.log("⏱️ Command timed out. Returning to wake listening.")
      console.log("--------------------------------")
      continue
    }

    console.log("🧠 Transcribing command...")
    const transcript = await transcribe(config.files.input)
    safeUnlink(config.files.input)

    if (
      normalizeAlpha(transcript) &&
      normalizeAlpha(transcript) === normalizeAlpha(config.tts.wakeAckText)
    ) {
      await sleep(2500)
      console.log("🔍 Wake word detected. Continuing...")
      continue
    }

    if (transcript) {
      console.log("🗣 You said:", transcript)
      await routeInputWithDeps(transcript)
    } else {
      console.log("⚠️ Nothing detected.")
    }

    console.log("--------------------------------")
  }
}

main().catch(console.error)
