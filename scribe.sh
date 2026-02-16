#!/bin/bash

WHISPER_CLI="./whisper.cpp/build/bin/whisper-cli"
MODEL="./whisper.cpp/models/ggml-base.en.bin"
AUDIO="./input.wav"
OUTPUT_FILE="scribe.json"

TEXT=$($WHISPER_CLI -f "$AUDIO" -m "$MODEL" -nt -of txt 2>/dev/null)

TEXT=$(echo "$TEXT" | xargs)  # trim whitespace

echo "--------------------------------"
echo "Transcribing..."
echo "--------------------------------"

echo "$TEXT"

# Write to JSON
echo "{\"content\": \"$(printf '%s' "$TEXT" | sed 's/"/\\"/g')\"}" > "$OUTPUT_FILE"

echo "📝 Written to $OUTPUT_FILE"
