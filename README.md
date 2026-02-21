# assistant

Local voice assistant prototype built with Bun, `whisper.cpp`, `llama.cpp`, and an `openwakeword` sidecar.

Status: **Developer beta**.

This is intended for local development and experimentation. macOS and Linux are supported for local dev.

## Features

- Wake-word listener (`src/sidecar.py`) using `openwakeword`
- Speech-to-text via `whisper.cpp`
- Local LLM completion via `llama.cpp` server
- Text-to-speech via auto-detected local command (`say` on macOS, `espeak`/`spd-say` on Linux)

## Limitations

- Model setup is manual.
- No production support or SLA.

## Prerequisites

- `git` (with submodule support)
- `bun` 1.0+
- `python` 3.10+
- `cmake` and a C/C++ toolchain
- `sox`
- TTS command:
  - macOS: built-in `say`
  - Linux: `espeak` or `spd-say` (speech-dispatcher)

## Quick Start

```bash
git clone https://github.com/capriok/assistant.git
cd assistant
bun run setup:submodules
bun i
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
bun run build:llama
bun run build:whisper
bun run model:download:whisper
bun run model:download
```

## Models

### Whisper model

Place a Whisper model in:

```text
packages/whisper.cpp/models/ggml-base.en.bin
```

Or download the default model:

```bash
bun run model:download:whisper
```

### LLM model

Download a GGUF model for `llama.cpp` and place it in:

```text
packages/llama.cpp/models/
```

The default CLI script expects:

```text
packages/llama.cpp/models/Qwen2.5-14B-Instruct-Q4_K_M.gguf
```

Or download via `llama.cpp`:

```bash
bun run model:download
```

## Run

Start the local LLM server:

```bash
bun run server
```

In another terminal, start the assistant:

```bash
source .venv/bin/activate
bun run assistant
```

Alias:

```bash
bun run assist
```

For auto-restart when files change during development:

```bash
source .venv/bin/activate
bun run assistant:watch
```

Alias:

```bash
bun run assist:dev
```

Expected startup output includes lines similar to:

- `Listening for wake word...`
- `Wake word detected!`
- `Transcribing command...`

## Configuration

Copy and customize environment variables:

```bash
cp .env.example .env
```

Supported variables:

- `TTS_RATE` (default: `240`)
- `TTS_VOICE` (default: `Moira`; for Linux `espeak`, set this to a valid `espeak` voice if needed)
- `TTS_COMMAND` (optional: force a specific TTS executable name from `PATH`)
- `WAKE_SELF_SUPPRESS_MS` (default: `1400`; ignore wake triggers during/just after local TTS to avoid self-trigger)
- `WAKE_ACK_TEXT` (default: `hello`, set empty to disable)
- `WHISPER_MODEL` (default: `./packages/whisper.cpp/models/ggml-base.en.bin`)
- `WHISPER_NO_GPU` (default: `0`; set `1` to force CPU transcription)
- `COMMAND_NO_SPEECH_TIMEOUT_MS` (default: `8000`)
- `INTERRUPT_NO_SPEECH_TIMEOUT_MS` (default: `5000`)
- `COMMAND_END_SILENCE_MS` (default: `1200`)
- `INTERRUPT_END_SILENCE_MS` (default: `900`)
- `COMMAND_MAX_CAPTURE_MS` (default: `12000`; hard stop for command capture)
- `INTERRUPT_MAX_CAPTURE_MS` (default: `8000`; hard stop for interrupt capture)
- `COMMAND_SILENCE_LEVEL` (default: `2.0%`; raise for noisy environments)
- `INTERRUPT_SILENCE_LEVEL` (default: `2.5%`; raise for noisy environments)

## Validation

Run project checks:

```bash
bun run check
```

## Troubleshooting

- `sidecar.py exited with code ...`
  - Ensure your virtual environment is active and `pip install -r requirements.txt` completed.
- `Microphone init failed`
  - Grant microphone permissions to your terminal app.
- `LLM HTTP ...`
  - Confirm `bun run server` is running and reachable at `http://localhost:8000`.
- `Insufficient Memory` / Metal OOM on server startup
  - Use a smaller model (default is Qwen2.5 14B) or lower `LLAMA_CTX_SIZE`/`LLAMA_GPU_LAYERS` in `.env`.
- `No such file or directory` for whisper/llama binaries
  - Re-run `bun run build:llama` and `bun run build:whisper`.
- `failed to open './packages/whisper.cpp/models/ggml-base.en.bin'`
  - Run `bun run model:download:whisper` or set `WHISPER_MODEL` in `.env`.
- Recorder hangs after you stop speaking
  - Increase `COMMAND_SILENCE_LEVEL` (example: `3.5%`) and/or lower `COMMAND_MAX_CAPTURE_MS`.
- `No supported TTS command found`
  - On Linux, install `espeak` or `speech-dispatcher` (`spd-say`), or set `TTS_COMMAND` to a valid command in `PATH`.

## Security

Report vulnerabilities per `/SECURITY.md`.

## Contributing

See `/CONTRIBUTING.md`.

## License

MIT. See `/LICENSE`.
