#!/usr/bin/env bash
# Start (or restart) the Grimhollow production server as a detached, self-healing
# process, so the work-host preview never shows "Bad Gateway".
#
#   scripts/serve.sh              # start/ensure it is up, then exit
#   scripts/serve.sh --watch      # stay resident and restart the server if it dies
#   scripts/serve.sh --stop       # stop a running server
#
# The port comes from PORT (default 12000, the work-host preview port).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-12000}"
LOGFILE="${LOGFILE:-/tmp/grimhollow.log}"
HEALTH="http://127.0.0.1:${PORT}/api/health"
# A distinctive argv marker so we find exactly our server, never another.
MARKER="server/src/index.js --grimhollow"

pids() { pgrep -f -- "$MARKER" 2>/dev/null || true; }

stop_server() {
  local list; list="$(pids)"
  [ -n "$list" ] || return 0
  kill $list 2>/dev/null || true
  for _ in $(seq 1 25); do [ -z "$(pids)" ] && break; sleep 0.2; done
  list="$(pids)"; [ -n "$list" ] && kill -9 $list 2>/dev/null || true
}

start_server() {
  (cd "$ROOT" && PORT="$PORT" setsid nohup node server/src/index.js --grimhollow >>"$LOGFILE" 2>&1 &)
  for _ in $(seq 1 60); do
    curl -fsS "$HEALTH" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}

if [ "${1:-}" = "--stop" ]; then stop_server; echo "stopped"; exit 0; fi

# Build the client once if it has never been built.
if [ ! -f "$ROOT/client/dist/index.html" ]; then
  echo "building client…"
  (cd "$ROOT" && npm run build) || exit 1
fi

if curl -fsS "$HEALTH" >/dev/null 2>&1; then
  echo "already up on :$PORT"
else
  stop_server
  start_server || { echo "failed to start; see $LOGFILE" >&2; exit 1; }
  echo "listening on :$PORT"
fi

if [ "${1:-}" = "--watch" ]; then
  echo "watching; Ctrl-C to stop"
  while true; do
    if ! curl -fsS "$HEALTH" >/dev/null 2>&1; then
      echo "$(date -Is) health check failed, restarting" >>"$LOGFILE"
      stop_server
      start_server || true
    fi
    sleep 5
  done
fi
