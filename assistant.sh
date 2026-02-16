#!/bin/bash

# -----------------------
# Config
# -----------------------

WHISPER_CLI="./whisper.cpp/build/bin/whisper-cli"
WHISPER_MODEL="../whisper.cpp/models/ggml-base.en.bin"
LLAMA_ENDPOINT="http://localhost:8000/completion"

AUDIO_FILE="./input.wav"

# -----------------------
# 1️⃣ Record
# -----------------------

echo "🎙 Speak... (auto-stop after silence)"

sox -d \
  -r 16000 \
  -c 1 \
  "$AUDIO_FILE" \
  silence 1 0.1 1% 1 1.0 1%

echo "✅ Recording complete"

# -----------------------
# 2️⃣ Transcribe
# -----------------------

echo "🧠 Transcribing..."

TRANSCRIPT=$($WHISPER_CLI -f "$AUDIO_FILE" -m "$WHISPER_MODEL" -nt -of txt 2>/dev/null)

TRANSCRIPT=$(echo "$TRANSCRIPT" | xargs)  # trim whitespace

if [ -z "$TRANSCRIPT" ]; then
  echo "⚠️ No speech detected."
  exit 1
fi

echo "🗣 You said:"
echo "$TRANSCRIPT"
echo "--------------------------------"

# -----------------------
# 3️⃣ Query LLM
# -----------------------

DATA="{
  \"prompt\": \"${TRANSCRIPT}\",
  \"n_predict\": 200,
  \"temperature\": 0.2
}"

RESPONSE=$(curl -s "$LLAMA_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$DATA")

CONTENT=$(echo "$RESPONSE" | jq -r '.content')

echo "🤖 Assistant:"
echo "$CONTENT"
