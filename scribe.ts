import { execFile } from "child_process"
import { promisify } from "util"
import { writeFileSync } from "fs"

const execFileAsync = promisify(execFile)

const WHISPER = "./whisper.cpp/build/bin/whisper-cli"
const MODEL = "./whisper.cpp/models/ggml-base.en.bin"
const AUDIO = "./input.wav"
const OUTPUT = "scribe.json"

console.log("--------------------------------")
console.log("Transcribing...")
console.log("--------------------------------")

const { stdout } = await execFileAsync(WHISPER, ["-f", AUDIO, "-m", MODEL, "-nt", "-of", "txt"])
const text = stdout.trim()

console.log(text)

writeFileSync(OUTPUT, JSON.stringify({ content: text }))
console.log(`📝 Written to ${OUTPUT}`)
