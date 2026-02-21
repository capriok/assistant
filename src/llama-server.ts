import { spawn } from "node:child_process"

const LLAMA_SERVER = "./packages/llama.cpp/build/bin/llama-server"
const HF_REPO = process.env.LLAMA_HF_REPO ?? "bartowski/Qwen2.5-14B-Instruct-GGUF:Q4_K_M"
const HOST = process.env.LLAMA_HOST ?? "127.0.0.1"
const PORT = process.env.LLAMA_PORT ?? "8000"
const CTX_SIZE = process.env.LLAMA_CTX_SIZE ?? "2048"
const GPU_LAYERS = process.env.LLAMA_GPU_LAYERS ?? "48"
const PARALLEL = process.env.LLAMA_PARALLEL ?? "1"
const NO_WARMUP = process.env.LLAMA_NO_WARMUP ?? "1"

console.log(`Running llama-server with ${HF_REPO}`)

const args = [
  "--hf-repo",
  HF_REPO,
  "--host",
  HOST,
  "--port",
  PORT,
  "--ctx-size",
  CTX_SIZE,
  "--n-gpu-layers",
  GPU_LAYERS,
  "--parallel",
  PARALLEL,
]

if (NO_WARMUP === "1" || NO_WARMUP.toLowerCase() === "true") {
  args.push("--no-warmup")
}

const proc = spawn(LLAMA_SERVER, args, { stdio: "inherit" })

proc.on("error", (err) => {
  console.error(err.message)
  process.exit(1)
})
proc.on("close", (code) => process.exit(code ?? 0))
