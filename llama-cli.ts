import { spawn } from "node:child_process"

const LLAMA_CLI = "./llama.cpp/build/bin/llama-cli"
const MODEL = "./llama.cpp/models/qwen2.5-1.5b-instruct-q4_k_m.gguf"

const prompt = process.argv[2]
if (!prompt) {
  console.error("Usage: bun llama-cli.ts <prompt>")
  process.exit(1)
}

const proc = spawn(LLAMA_CLI, ["-m", MODEL, "-p", prompt], { stdio: "inherit" })
proc.on("error", (err) => {
  console.error(err.message)
  process.exit(1)
})
proc.on("close", (code) => process.exit(code ?? 0))
