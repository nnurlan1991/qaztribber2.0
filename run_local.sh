#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg не найден. Установите: brew install ffmpeg" >&2
  exit 1
fi

if [ ! -x "$ROOT_DIR/backend/.venv/bin/python" ]; then
  echo "Создаю Python-окружение…"
  python3.11 -m venv "$ROOT_DIR/backend/.venv"
fi

if ! "$ROOT_DIR/backend/.venv/bin/python" -c "import fastapi, gigaam" >/dev/null 2>&1; then
  echo "Устанавливаю Python-зависимости…"
  "$ROOT_DIR/backend/.venv/bin/python" -m pip install --upgrade pip
  "$ROOT_DIR/backend/.venv/bin/pip" install -r "$ROOT_DIR/backend/requirements.txt"
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "Устанавливаю frontend-зависимости…"
  (cd "$ROOT_DIR/frontend" && npm install)
fi

cleanup() { kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$ROOT_DIR/backend" && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!
(cd "$ROOT_DIR/frontend" && npm run dev -- --host 127.0.0.1) &
FRONTEND_PID=$!

echo "QazTriber доступен: http://127.0.0.1:5173"
wait "$BACKEND_PID" "$FRONTEND_PID"
