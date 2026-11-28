#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "${ROOT}/scripts/debug-stop.sh"

cd "${ROOT}"
exec npx tauri dev "$@"
