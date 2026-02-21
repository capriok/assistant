import { spawn, spawnSync } from "node:child_process"

export function runCommandAndExit(command: string, args: string[]): void {
  const proc = spawn(command, args, { stdio: "inherit" })
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
