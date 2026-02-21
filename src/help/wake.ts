import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

export type WakeState = {
  useManualWake: boolean
  wakeProc: ReturnType<typeof spawn> | null
}

export function installShutdownHandlers(state: WakeState): void {
  const shutdown = () => {
    if (state.wakeProc && !state.wakeProc.killed) {
      state.wakeProc.kill("SIGTERM")
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

export function spawnWakeSidecar(
  wakeSidecarPath: string,
  state: WakeState
): ReturnType<typeof createInterface> {
  const proc = spawn("python3", [wakeSidecarPath], {
    stdio: ["ignore", "pipe", "inherit"],
  })
  state.wakeProc = proc

  const stdout = proc.stdout
  if (!stdout) {
    console.error("Wake sidecar started without stdout pipe.")
    console.error("Falling back to manual trigger mode.")
    state.useManualWake = true
    const fallback = createInterface({ input: process.stdin, output: process.stdout })
    queueMicrotask(() => fallback.emit("line", "WAKE_DETECTED"))
    return fallback
  }

  const lines = createInterface({ input: stdout })

  proc.on("error", (err) => {
    console.error("Failed to start wake sidecar:", err.message)
    console.error("Falling back to manual trigger mode.")
    state.useManualWake = true
    lines.emit("line", "WAKE_DETECTED")
  })

  proc.on("close", (code) => {
    if (state.useManualWake) return
    console.error(`sidecar.py exited with code ${code}`)
    console.error("Falling back to manual trigger mode.")
    state.useManualWake = true
    lines.emit("line", "WAKE_DETECTED")
  })

  return lines
}

export function waitForWake(
  lines: ReturnType<typeof createInterface>,
  state: WakeState
): Promise<void> {
  if (state.useManualWake) {
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
