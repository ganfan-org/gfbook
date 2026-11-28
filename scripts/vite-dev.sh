#!/usr/bin/env bash
# Background Vite task. Reuses a healthy server from this repo instead of
# starting a second one on the same port, so restarts never hit EADDRINUSE.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/debug-env.sh"

echo "[vite] starting"

if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  for pid in $(lsof -tiTCP:"${PORT}" -sTCP:LISTEN); do
    cmd="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
    case "${cmd}" in
      *"${ROOT}/node_modules/.bin/vite"* | *"${ROOT}/node_modules/vite/bin/vite.js"*)
        echo "[vite] reusing existing server (pid ${pid})"
        echo "[vite] ready"
        while kill -0 "${pid}" 2>/dev/null; do
          sleep 2
        done
        exit 0
        ;;
      *)
        echo "[vite] port ${PORT} is held by an unrelated process:" >&2
        echo "  ${cmd}" >&2
        exit 1
        ;;
    esac
  done
fi

npx vite --port "${PORT}" --strictPort &
child=$!
trap 'kill "${child}" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 100); do
  if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[vite] ready"
    break
  fi
  if ! kill -0 "${child}" 2>/dev/null; then
    echo "[vite] failed to start" >&2
    exit 1
  fi
  sleep 0.2
done

if ! lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[vite] failed to start" >&2
  exit 1
fi

wait "${child}"
