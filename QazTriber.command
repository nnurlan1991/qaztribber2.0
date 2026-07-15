#!/usr/bin/env bash
# Двойной клик в Finder открывает Terminal, запускает локальный сервер и браузер.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT_DIR/run_local.sh"
