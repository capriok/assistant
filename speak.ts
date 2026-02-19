import { spawn } from "child_process"

const PIPER_MODEL = process.env.PIPER_MODEL ?? "./models/en_US-lessac-medium.onnx"

const text = process.argv[2]
if (!text) {
  console.error("Usage: bun speak.ts <text>")
  process.exit(1)
}

// echo text | piper --model ... --output-raw | sox raw->wav | afplay
const piper = spawn("piper", ["--model", PIPER_MODEL, "--output-raw"], { stdio: ["pipe", "pipe", "inherit"] })
const sox = spawn(
  "sox",
  ["-r", "22050", "-c", "1", "-b", "16", "-e", "signed-integer", "-t", "raw", "-", "-t", "wav", "-"],
  { stdio: ["pipe", "pipe", "inherit"] }
)
const afplay = spawn("afplay", ["-"], { stdio: ["pipe", "inherit", "inherit"] })

piper.stdout.pipe(sox.stdin)
sox.stdout.pipe(afplay.stdin)

piper.stdin.write(text)
piper.stdin.end()

piper.on("error", (err) => { console.error("piper:", err.message); process.exit(1) })
afplay.on("close", (code) => process.exit(code ?? 0))
