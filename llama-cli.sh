#!/bin/bash

PROMPT=$1

LLAMA_CLI="./llama.cpp/build/bin/llama-cli"
MODEL_PATH="./llama.cpp/models/"
MODEL="qwen2.5-1.5b-instruct-q4_k_m.gguf"

$LLAMA_CLI -m $MODEL_PATH$MODEL -p "$PROMPT"