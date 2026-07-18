"""Tauri sidecar: поднимает локальный API. Окно открывает Tauri."""
from __future__ import annotations

import uvicorn

from backend.app.main import app

HOST = "127.0.0.1"
PORT = 8765


def main() -> None:
    # PyInstaller запускает Windows-версию без консоли: sys.stdout/sys.stderr
    # могут быть None. Стандартный цветной логгер Uvicorn вызывает isatty() и
    # из-за этого падает ещё до старта сервера. Логи для sidecar не нужны,
    # поэтому полностью отключаем его конфигурацию.
    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        log_config=None,
        access_log=False,
    )
    server = uvicorn.Server(config)
    # Главный поток — процесс живёт, пока Tauri не завершит его.
    server.run()


if __name__ == "__main__":
    main()
