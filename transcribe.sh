#!/bin/bash

WHISPER_CLI="./whisper.cpp/build/bin/whisper-cli"
MODEL="./whisper.cpp/models/ggml-base.en.bin"
AUDIO="./input.wav"

TEXT=$($WHISPER_CLI -f "$AUDIO" -m "$MODEL" -nt -of txt 2>/dev/null)

echo "--------------------------------"
echo "Transcribing..."
echo "--------------------------------"

echo "$TEXT"