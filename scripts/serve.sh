#!/usr/bin/env bash
# Keep the Grimhollow preview up. Idempotent and safe to run concurrently.
#
#   scripts/serve.sh              # ensure server + a single resident watcher, then exit
#   scripts/serve.sh --watch      # stay resident; restart the server if it dies
#   scripts/serve.sh --stop       # stop the server and the watcher
#
# Port comes from PORT (default 12000, the work-host preview port).
set -u

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
PORT="${PORT:-12000}"
LOGFILE="${LOGFILE:-/tmp/grimhollow.log}"
WATCHLOG="${WATCHLOG:-/tmp/grimhollow-watch.log}"
HEALTH="http://127.0.0.1:${PORT}/api/health"
MARKER="server/src/index.js --grimhollow"
WATCH_MARKER="serve.sh --watch"

BUILD_TIMEOUT="${BUILD_TIMEOUT:-120}"
BUILD_STAMP="$ROOT/client/dist/.build-stamp"

pids() { pgrep -f -- "$MARKER" 2>/dev/null || true; }
up() { curl -fsS --max-time 2 "$HEALTH" >/dev/null 2>&1; }

# The client bundle is gitignored, so after a sandbox pause/resume the volume can
# keep a STALE client/dist while the server happily serves it — the page "falls
# over" even though the API is up. Stamp the built bundle with the commit it came
# from and rebuild whenever that commit no longer matches HEAD, or the stamp is
# missing (a bundle baked by an older sandbox). Comparing commits is more robust
# than mtimes, which survive a restore of an old dist across the pause.
needs_build() {
  local index="$ROOT/client/dist/index.html"
  [ -f "$index" ] || return 0
  local head; head="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
  [ -n "$head" ] || return 0
  # rev of the tracked client tree: changes only when client sources change, so an
  # unrelated commit does not trigger a needless rebuild.
  local rev; rev="$(git -C "$ROOT" rev-parse "HEAD:client" 2>/dev/null || echo "$head")"
  [ "$(cat "$BUILD_STAMP" 2>/dev/null)" != "$rev" ] && return 0
  # Uncommitted client edits (a wave in progress) are newer than the built index.
  local newer
  newer="$(find "$ROOT/client/src" "$ROOT/client/public" "$ROOT/client/index.html" \
      "$ROOT/client/vite.config.js" -newer "$index" -print -quit 2>/dev/null)"
  [ -n "$newer" ]
}

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

build_client() {
  ( cd "$ROOT" && timeout "$BUILD_TIMEOUT" npm run build >>"$LOGFILE" 2>&1 ) || true
  # Only stamp a build that actually produced a bundle; a failed build must stay
  # un-stamped so the next pass retries instead of locking in a bad dist.
  [ -f "$ROOT/client/dist/index.html" ] || return 0
  local rev; rev="$(git -C "$ROOT" rev-parse "HEAD:client" 2>/dev/null || git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
  [ -n "$rev" ] && printf '%s' "$rev" >"$BUILD_STAMP"
}

ensure() {
  up && return 0
  needs_build && build_client
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
        needs_build && build_client
        stop_server; start_server || true
      elif needs_build; then
        echo "$(date -Is) client bundle stale; rebuilding" >>"$LOGFILE"
        build_client
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
