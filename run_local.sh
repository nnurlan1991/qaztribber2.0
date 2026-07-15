#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

PYTHON_BIN="${PYTHON_BIN:-python3.11}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

if [ ! -x "$ROOT_DIR/backend/.venv/bin/python" ]; then
  echo "Создаю Python-окружение…"
  "$PYTHON_BIN" -m venv "$ROOT_DIR/backend/.venv"
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
(cd "$ROOT_DIR/frontend" && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort) &
FRONTEND_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:5173 >/dev/null 2>&1; then
    open "http://127.0.0.1:5173"
    break
  fi
  sleep 0.25
done

echo "QazTriber запущен: http://127.0.0.1:5173"
echo "Не закрывайте это окно Terminal, пока работаете. Для остановки нажмите Ctrl+C."
wait "$BACKEND_PID" "$FRONTEND_PID"
