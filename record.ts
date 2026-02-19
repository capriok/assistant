import { spawn } from "child_process"

const OUTPUT = "input.wav"

console.log("🎙 Speak... (will auto-stop after silence)")

const sox = spawn(
  "sox",
  ["-d", "-r", "16000", "-c", "1", OUTPUT, "silence", "1", "0.1", "1%", "1", "1.0", "1%"],
  { stdio: "inherit" }
)

sox.on("error", (err) => { console.error(err.message); process.exit(1) })
sox.on("close", () => {
  console.log("--------------------------------")
  console.log(`Recording complete: ${OUTPUT}`)
})
