#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  wait "${BACKEND_PID}" 2>/dev/null || true
  wait "${FRONTEND_PID}" 2>/dev/null || true

  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Missing backend/.env" >&2
  echo "Create it from backend/.env.example before running this script." >&2
  exit 1
fi

if [[ ! -f "$FRONTEND_DIR/.env" && ! -f "$FRONTEND_DIR/.env.local" ]]; then
  echo "Missing frontend/.env or frontend/.env.local" >&2
  echo "Create one from frontend/.env.example before running this script." >&2
  exit 1
fi

echo "Starting Relay Plus backend on http://127.0.0.1:4000"
(
  cd "$BACKEND_DIR"
  cargo run
) &
BACKEND_PID=$!

echo "Starting Relay Plus frontend on http://127.0.0.1:3000"
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID"
    break
  fi

  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    wait "$FRONTEND_PID"
    break
  fi

  sleep 1
done
