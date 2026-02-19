#!/bin/bash
# Speak text via Piper TTS and play on macOS with afplay.
#
# Usage: bash speak.sh "Hello, world!"
#
# Install: pip install piper-tts
# Model:   piper --download-voice en_US-lessac-medium  (saves to ./models/)

PIPER_MODEL="${PIPER_MODEL:-./models/en_US-lessac-medium.onnx}"

echo "$1" | piper --model "$PIPER_MODEL" --output-raw \
  | sox -r 22050 -c 1 -b 16 -e signed-integer -t raw - -t wav - \
  | afplay -
