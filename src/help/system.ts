import { spawn, spawnSync } from "node:child_process"
import { createInterface } from "node:readline"

/**
 * Run a command until it exits, then exit with its code. With `filter`, each
 * line of its output (stdout and stderr) is passed through it: return the
 * line to print, or null to drop it.
 */
export function runCommandAndExit(
  command: string,
  args: string[],
  filter?: (line: string) => string | null
): void {
  const proc = spawn(command, args, { stdio: filter ? ["inherit", "pipe", "pipe"] : "inherit" })
  if (filter) {
    for (const stream of [proc.stdout, proc.stderr]) {
      if (!stream) continue
      createInterface({ input: stream }).on("line", (line) => {
        const out = filter(line)
        if (out !== null) console.log(out)
      })
    }
  }
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
