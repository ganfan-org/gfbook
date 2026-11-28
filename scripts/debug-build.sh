#!/usr/bin/env bash
# Build the Rust backend. Safe to run on every launch and debug restart.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/debug-env.sh"

echo "[debug] building Rust backend"
TAURI_CONFIG='{"productName":"Ganfan Book Dev","identifier":"org.ganfan.app.gfbook.dev"}' \
  cargo build --manifest-path "${ROOT}/src-tauri/Cargo.toml" --no-default-features

if ! lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  log_file="${TMPDIR:-/tmp}/gfbook-vite-${PORT}.log"
  echo "[debug] Vite is not running; starting it (log: ${log_file})"
  (
    cd "${ROOT}"
    nohup npx vite --port "${PORT}" --strictPort >"${log_file}" 2>&1 &
  )
  for _ in $(seq 1 50); do
    if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

if ! lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[debug] WARNING: Vite is not running on port ${PORT}." >&2
  echo "[debug] Stop debugging and press F5 to start the dev server." >&2
fi
