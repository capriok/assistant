import { spawn } from "child_process"

const LLAMA_SERVER = "./llama.cpp/build/bin/llama-server"
const MODEL = "./llama.cpp/models/qwen2.5-1.5b-instruct-q4_k_m.gguf"
const SYSTEM_PROMPT = "You are a helpful assistant."

console.log(`Running llama-server with model ${MODEL.split("/").pop()}`)

const proc = spawn(
  LLAMA_SERVER,
  ["--model", MODEL, "--port", "8000", "--ctx-size", "2048", "--n-gpu-layers", "0", "--system-prompt", SYSTEM_PROMPT],
  { stdio: "inherit" }
)

proc.on("error", (err) => { console.error(err.message); process.exit(1) })
proc.on("close", (code) => process.exit(code ?? 0))
