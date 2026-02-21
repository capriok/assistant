import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

const LLAMA_CLI = "./packages/llama.cpp/build/bin/llama-cli"
const MODEL = "./packages/llama.cpp/models/Qwen2.5-14B-Instruct-Q4_K_M.gguf"
const HF_REPO = process.env.LLAMA_HF_REPO ?? "bartowski/Qwen2.5-14B-Instruct-GGUF:Q4_K_M"
const GPU_LAYERS = process.env.LLAMA_CLI_GPU_LAYERS ?? "0"

const prompt = process.argv[2]
if (!prompt) {
  console.error("Usage: bun cli <prompt>")
  process.exit(1)
}

const args = existsSync(MODEL)
  ? ["-m", MODEL, "--n-gpu-layers", GPU_LAYERS, "-p", prompt]
  : ["--hf-repo", HF_REPO, "--n-gpu-layers", GPU_LAYERS, "-p", prompt]
const proc = spawn(LLAMA_CLI, args, { stdio: "inherit" })
proc.on("error", (err) => {
  console.error(err.message)
  process.exit(1)
})
proc.on("close", (code) => process.exit(code ?? 0))
