import { spawn } from "node:child_process"

const LLAMA_SERVER = "./llama.cpp/build/bin/llama-server"
const HF_REPO = process.env.LLAMA_HF_REPO ?? "Qwen/Qwen3-32B-GGUF"
const HF_FILE = process.env.LLAMA_HF_FILE ?? "Qwen3-32B-Q4_K_M.gguf"
const HOST = process.env.LLAMA_HOST ?? "127.0.0.1"
const PORT = process.env.LLAMA_PORT ?? "8000"
const CTX_SIZE = process.env.LLAMA_CTX_SIZE ?? "4096"
const GPU_LAYERS = process.env.LLAMA_GPU_LAYERS ?? "auto"
const PARALLEL = process.env.LLAMA_PARALLEL ?? "1"

console.log(`Running llama-server with ${HF_REPO}/${HF_FILE}`)

// biome-ignore format:false
const proc = spawn(
  LLAMA_SERVER,
  [
    "--hf-repo", HF_REPO,
    "--hf-file", HF_FILE,
    "--host", HOST,
    "--port", PORT,
    "--ctx-size", CTX_SIZE,
    "--n-gpu-layers", GPU_LAYERS,
    "--parallel", PARALLEL,
  ],
  { stdio: "inherit" }
)

proc.on("error", (err) => {
  console.error(err.message)
  process.exit(1)
})
proc.on("close", (code) => process.exit(code ?? 0))
