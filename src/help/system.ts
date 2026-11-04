import { spawn, spawnSync } from "node:child_process"

export function runCommandAndExit(command: string, args: string[]): void {
  const proc = spawn(command, args, { stdio: "inherit" })
  // A supervisor stopping just this wrapper (moon sends SIGTERM when another
  // task fails) would otherwise leave the child running and holding its port,
  // so pass those on. Ctrl-C is different: the terminal already sends SIGINT
  // to the child too, and a second one makes llama-server abort mid-cleanup.
  // Wait for the child to exit either way; it ends this process on close.
  for (const signal of ["SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => proc.kill(signal))
  }
  process.on("SIGINT", () => {})
  proc.on("error", (err) => {
    console.error(err.message)
    process.exit(1)
  })
  proc.on("close", (code) => process.exit(code ?? 0))
}

export function safeUnlink(path: string): void {
  const rm = spawn("rm", ["-f", path], { stdio: "ignore" })
  rm.on("error", () => {})
}

export function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${shellEscape(command)} >/dev/null 2>&1`], {
    stdio: "ignore",
  })
  return result.status === 0
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
