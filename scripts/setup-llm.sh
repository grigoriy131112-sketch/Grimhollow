#!/usr/bin/env bash
# Download the optional local AI for Grimhollow dialogue.
#
# This is the "eternal" layer: an open-weights Qwen model run locally through
# llama.cpp. No API key, no expiry, no internet at runtime. The game works
# without it (the deterministic engine is always there), so this is opt-in.
#
# Usage:  bash scripts/setup-llm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS="$ROOT/models"
LLAMA_DIR="$MODELS/llama"
LLAMA_TAG="${LLAMA_TAG:-b11379}"
GGUF="$MODELS/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf"

mkdir -p "$LLAMA_DIR"

if [ ! -x "$LLAMA_DIR/llama-server" ]; then
  echo "==> Downloading llama.cpp ($LLAMA_TAG, CPU build)"
  curl -fL --progress-bar -o /tmp/llama.tar.gz \
    "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz"
  tar xzf /tmp/llama.tar.gz -C "$LLAMA_DIR" --strip-components=1
  rm -f /tmp/llama.tar.gz
else
  echo "==> llama.cpp already present"
fi

if [ ! -f "$GGUF" ]; then
  echo "==> Downloading Qwen2.5-7B-Instruct (Q4_K_M, ~4.5 GB, two shards)"
  BASE="https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m"
  for part in 00001-of-00002 00002-of-00002; do
    curl -fL --progress-bar -o "$MODELS/qwen2.5-7b-instruct-q4_k_m-${part}.gguf" \
      "${BASE}-${part}.gguf"
  done
else
  echo "==> Qwen model already present"
fi

echo "==> Done. Start it with: bash scripts/start-llm.sh"
