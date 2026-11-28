#!/usr/bin/env bash
# Full cleanup: stop this repo's Vite server and GanfanBook processes.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/debug-env.sh"

if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true); do
    cmd="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
    case "${cmd}" in
      *"${ROOT}/node_modules/.bin/vite"* | *"${ROOT}/node_modules/vite/bin/vite.js"*)
        echo "[debug] stopping Vite on port ${PORT} (pid ${pid})"
        kill "${pid}" 2>/dev/null || true
        ;;
      *)
        echo "[debug] port ${PORT} is held by an unrelated process, leaving it alone" >&2
        ;;
    esac
  done
fi

bash "${ROOT}/scripts/debug-clean-app.sh"
