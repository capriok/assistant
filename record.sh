#!/bin/bash

echo "🎙 Speak... (will auto-stop after silence)"

sox -d \
  -r 16000 \
  -c 1 \
  input.wav \
  silence 1 0.1 1% 1 1.0 1%

echo "--------------------------------"
echo "Recording complete: input.wav"