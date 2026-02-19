#!/bin/bash

PROMPT=$1

LLAMA_SERVER="./llama.cpp/build/bin/llama-server"
MODEL_PATH="./llama.cpp/models/"
MODEL="qwen2.5-1.5b-instruct-q4_k_m.gguf"

SYSTEM_PROMPT="You are a helpful assistant."

echo "Running llama-server with model $MODEL"
$LLAMA_SERVER --model $MODEL_PATH$MODEL --port 8000 --ctx-size 2048 --n-gpu-layers 0 --system-prompt "$SYSTEM_PROMPT"