#!/usr/bin/env bash
# Stop only stale GanfanBook processes from this repository.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/debug-env.sh"

if [ -n "${GFBOOK_SKIP_APP_CLEANUP:-}" ]; then
  exit 0
fi

stale_app="$(pgrep -f "${ROOT}/target/debug/GanfanBook" || true)"
if [ -n "${stale_app}" ]; then
  echo "[debug] stopping stale GanfanBook: ${stale_app}"
  # shellcheck disable=SC2086
  kill ${stale_app} 2>/dev/null || true
fi
