# assistant

Local voice assistant prototype built with Bun, `whisper.cpp`, `llama.cpp`, and an `openwakeword` sidecar.

Status: **Developer beta**.

This is intended for local development and experimentation. The primary supported target is macOS. Linux is best-effort.

## Features

- Wake-word listener (`wake.py`) using `openwakeword`
- Speech-to-text via `whisper.cpp`
- Local LLM completion via `llama.cpp` server
- Text-to-speech via macOS `say`

## Limitations

- TTS currently uses macOS `say`; Linux users need an alternative TTS command.
- Model setup is manual.
- No production support or SLA.

## Prerequisites

- `git` (with submodule support)
- `bun` 1.0+
- `python` 3.10+
- `cmake` and a C/C++ toolchain
- macOS for built-in TTS (`say`)

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
```

## Models

### Whisper model

Place a Whisper model in:

```text
whisper.cpp/models/ggml-base.en.bin
```

### LLM model

Download a GGUF model for `llama.cpp` and place it in:

```text
llama.cpp/models/
```

The default CLI script expects:

```text
llama.cpp/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
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
- `TTS_VOICE` (default: `Moira`)

## Validation

Run project checks:

```bash
bun run check
```

## Troubleshooting

- `wake.py exited with code ...`
  - Ensure your virtual environment is active and `pip install -r requirements.txt` completed.
- `Microphone init failed`
  - Grant microphone permissions to your terminal app.
- `LLM HTTP ...`
  - Confirm `bun run server` is running and reachable at `http://localhost:8000`.
- `No such file or directory` for whisper/llama binaries
  - Re-run `bun run build:llama` and `bun run build:whisper`.

## Security

Report vulnerabilities per `/SECURITY.md`.

## Contributing

See `/CONTRIBUTING.md`.

## License

MIT. See `/LICENSE`.
