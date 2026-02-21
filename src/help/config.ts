import { parseBooleanEnv, parseSoxSilenceLevel, parseTimeoutMs } from "./env.ts"

const DEFAULT_WHISPER_MODEL = "./packages/whisper.cpp/models/ggml-base.en.bin"

const config = {
  whisper: {
    path: "./packages/whisper.cpp/build/bin/whisper-cli",
    modelPath: process.env.WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL,
    noGpu: parseBooleanEnv(process.env.WHISPER_NO_GPU, false),
  },
  llm: {
    endpoint: "http://localhost:8000/completion",
    style: [
      "You are a concise voice assistant.",
      "Answer in 1-2 short sentences.",
      "No preamble, no uncertainty unless necessary.",
      "Prefer direct factual answers.",
    ].join(" "),
  },
  tts: {
    rate: process.env.TTS_RATE ?? "240",
    voice: process.env.TTS_VOICE ?? "Moira",
    wakeAckText: process.env.WAKE_ACK_TEXT ?? "hello",
    command: process.env.TTS_COMMAND?.trim() ?? "",
  },
  capture: {
    commandNoSpeechTimeoutMs: parseTimeoutMs(
      process.env.COMMAND_NO_SPEECH_TIMEOUT_MS ?? process.env.COMMAND_TIMEOUT_MS,
      8000
    ),
    interruptNoSpeechTimeoutMs: parseTimeoutMs(
      process.env.INTERRUPT_NO_SPEECH_TIMEOUT_MS ?? process.env.INTERRUPT_TIMEOUT_MS,
      5000
    ),
    commandEndSilenceMs: parseTimeoutMs(process.env.COMMAND_END_SILENCE_MS, 1200),
    interruptEndSilenceMs: parseTimeoutMs(process.env.INTERRUPT_END_SILENCE_MS, 900),
    commandMaxCaptureMs: parseTimeoutMs(process.env.COMMAND_MAX_CAPTURE_MS, 12000),
    interruptMaxCaptureMs: parseTimeoutMs(process.env.INTERRUPT_MAX_CAPTURE_MS, 8000),
    commandSilenceLevel: parseSoxSilenceLevel(process.env.COMMAND_SILENCE_LEVEL, "2.0%"),
    interruptSilenceLevel: parseSoxSilenceLevel(process.env.INTERRUPT_SILENCE_LEVEL, "2.5%"),
  },
  files: {
    input: `/tmp/assistant-input-${process.pid}.wav`,
    interrupt: `/tmp/assistant-interrupt-${process.pid}.wav`,
  },
  wake: {
    sidecarPath: new URL("../sidecar.py", import.meta.url).pathname,
  },
}

export default config
