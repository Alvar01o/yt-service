#!/bin/bash

# Verificar que se pase un parámetro
if [ -z "$1" ]; then
  echo "Uso: $0 <URL_YOUTUBE>"
  exit 1
fi

YOUTUBE_URL="$1"

curl -X POST http://localhost:3003/api/downloadmp3_2 \
  -H "Content-Type: application/json" \
  -d "{\"youtubeUrl\": \"$YOUTUBE_URL\"}"
