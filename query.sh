#!/bin/bash

PROMPT="$1"

ENDPOINT="http://localhost:8000/completion"

DATA="{
    \"prompt\": \"${PROMPT}\",
    \"n_predict\": 200,
    \"temperature\": 0.2
  }"

RESPONSE=$(curl -s $ENDPOINT \
  -H "Content-Type: application/json" \
  -d "$DATA")

CONTENT=$(echo "$RESPONSE" | jq -r '.content')

echo "--------------------------------"

echo "Query:"
echo "$PROMPT"
echo "--------------------------------"
echo "Response:"
echo "$CONTENT"