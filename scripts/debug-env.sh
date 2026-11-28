#!/usr/bin/env bash
# Shared environment for debug helper scripts.
# VS Code launched from the Dock may not see cargo or nvm-managed node.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${GFBOOK_DEBUG_PORT:-1420}"

if [ -d "${HOME}/.nvm/versions/node" ]; then
  node_bin="$(ls -d "${HOME}"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "${node_bin}" ]; then
    PATH="${node_bin}:${PATH}"
  fi
fi
PATH="/opt/homebrew/bin:/opt/homebrew/opt/rustup/bin:${HOME}/.cargo/bin:${HOME}/.local/bin:/usr/sbin:/sbin:${PATH}"
export PATH

export ROOT PORT
