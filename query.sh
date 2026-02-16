#!/bin/bash

ENDPOINT="http://localhost:8000/completion"

# -----------------------------------
# Determine input source
# -----------------------------------

if [ -z "$1" ]; then
  INPUT_FILE="scribe.json"
elif [ -f "$1" ]; then
  INPUT_FILE="$1"
else
  PROMPT="$1"
fi

if [ -n "$INPUT_FILE" ]; then
  if [ ! -f "$INPUT_FILE" ]; then
    echo "❌ File not found: $INPUT_FILE"
    exit 1
  fi

  PROMPT=$(jq -r '.content' "$INPUT_FILE")

  if [ -z "$PROMPT" ] || [ "$PROMPT" = "null" ]; then
    echo "❌ No .content field in $INPUT_FILE"
    exit 1
  fi
fi

# -----------------------------------
# Query llama-server
# -----------------------------------

DATA=$(jq -n \
  --arg prompt "$PROMPT" \
  '{prompt: $prompt, n_predict: 200, temperature: 0.2}')

RESPONSE=$(curl -s "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$DATA")

CONTENT=$(echo "$RESPONSE" | jq -r '.content')

echo "--------------------------------"
echo "Query:"
echo "$PROMPT"
echo "--------------------------------"
echo "Response:"
echo "$CONTENT"
