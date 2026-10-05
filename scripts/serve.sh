#!/usr/bin/env bash
# Keep the Grimhollow preview up. Idempotent and safe to run concurrently.
#
#   scripts/serve.sh              # ensure server + a single resident watcher, then exit
#   scripts/serve.sh --watch      # stay resident; restart the server if it dies
#   scripts/serve.sh --stop       # stop the server and the watcher
#
# Port comes from PORT (default 12000, the work-host preview port).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-12000}"
LOGFILE="${LOGFILE:-/tmp/grimhollow.log}"
WATCHLOG="${WATCHLOG:-/tmp/grimhollow-watch.log}"
HEALTH="http://127.0.0.1:${PORT}/api/health"
MARKER="server/src/index.js --grimhollow"
WATCH_MARKER="serve.sh --watch"

pids() { pgrep -f -- "$MARKER" 2>/dev/null || true; }
up() { curl -fsS --max-time 2 "$HEALTH" >/dev/null 2>&1; }

stop_server() {
  local list; list="$(pids)"
  [ -n "$list" ] || return 0
  kill $list 2>/dev/null || true
  for _ in $(seq 1 25); do [ -z "$(pids)" ] && break; sleep 0.2; done
  list="$(pids)"; [ -n "$list" ] && kill -9 $list 2>/dev/null || true
}

start_server() {
  # Fully detach: new session (setsid), stdin from /dev/null, stdout/stderr to
  # the log. The subshell is backgrounded and replaced via `exec`, so this script
  # never waits on the server and never inherits it as a job — a caller that
  # captures stdout (a hook) must not block on the server's file descriptors.
  ( cd "$ROOT" && PORT="$PORT" exec setsid node server/src/index.js --grimhollow >>"$LOGFILE" 2>&1 </dev/null & )
  for _ in $(seq 1 80); do up && return 0; sleep 0.25; done
  return 1
}

ensure() {
  up && return 0
  [ -f "$ROOT/client/dist/index.html" ] || (cd "$ROOT" && npm run build >/dev/null 2>&1) || true
  stop_server
  start_server
}

# Start a detached watcher. Skip entirely when one is already resident: spawning a
# short-lived `flock` that immediately loses the lock would leave a zombie (PID 1
# here is the agent server and does not reap). flock remains the second guard, so
# a rare race still cannot produce two watchers.
start_watcher() {
  pgrep -f -- "$WATCH_MARKER" >/dev/null 2>&1 && return 0
  ( exec setsid flock -n /tmp/grimhollow-watch.lock "$0" --watch >>"$WATCHLOG" 2>&1 </dev/null & )
}

case "${1:-}" in
  --stop) stop_server; pkill -f -- "$WATCH_MARKER" 2>/dev/null; echo "stopped"; exit 0 ;;
  --watch)
    # Locking is done by the flock wrapper in start_watcher, which guarantees a
    # single resident watcher across concurrent hook invocations.
    while true; do
      if ! up; then
        echo "$(date -Is) down; restarting" >>"$LOGFILE"
        stop_server; start_server || true
      fi
      sleep 5
    done
    ;;
  *)
    ensure
    start_watcher
    if up; then echo "listening on :$PORT"; else echo "failed to start; see $LOGFILE" >&2; exit 1; fi
    ;;
esac
exit 0
