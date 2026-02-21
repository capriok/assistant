import { existsSync } from "node:fs"

const requiredFiles = [
  "src/assistant.ts",
  "src/llama-cli.ts",
  "src/asststant-server.ts",
  "src/sidecar.py",
  ".gitmodules",
  "packages/llama.cpp/CMakeLists.txt",
  "packages/whisper.cpp/CMakeLists.txt",
  "wakewords/_shared/embedding_model.onnx",
  "wakewords/_shared/melspectrogram.onnx",
]

const missing = requiredFiles.filter((file) => !existsSync(file))

if (missing.length > 0) {
  console.error("Missing required project files:")
  for (const file of missing) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

console.log("Smoke check passed: required files and paths are present.")
