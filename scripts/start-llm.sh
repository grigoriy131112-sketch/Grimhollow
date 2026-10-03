#!/usr/bin/env bash
# Start the local dialogue model (llama.cpp server with Qwen).
#
# The game server probes http://127.0.0.1:8080 and uses it when present. If this
# is not running, dialogue still works via the deterministic engine.
#
# Usage:  bash scripts/start-llm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/models/llama/llama-server"
GGUF="${LLM_MODEL_PATH:-$ROOT/models/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
PORT="${LLM_PORT:-8080}"
THREADS="${LLM_THREADS:-4}"

if [ ! -x "$BIN" ] || [ ! -f "$GGUF" ]; then
  echo "Model or runtime missing. Run: bash scripts/setup-llm.sh" >&2
  exit 1
fi

echo "==> Starting llama-server on :$PORT (model: $(basename "$GGUF"))"
exec "$BIN" -m "$GGUF" --port "$PORT" -c 2048 -t "$THREADS" --no-webui
