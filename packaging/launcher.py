"""Нативный лаунчер: поднимает локальный API и открывает браузер."""
from __future__ import annotations

import socket
import threading
import time
import webbrowser

import uvicorn

from backend.app.main import app

HOST = "127.0.0.1"
PORT = 8765


def server_is_ready() -> bool:
    try:
        with socket.create_connection((HOST, PORT), timeout=0.25):
            return True
    except OSError:
        return False


def main() -> None:
    if server_is_ready():
        webbrowser.open(f"http://{HOST}:{PORT}")
        return

    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="qaztriber-local-server", daemon=True)
    thread.start()

    for _ in range(80):
        if server_is_ready():
            webbrowser.open(f"http://{HOST}:{PORT}")
            break
        time.sleep(0.1)

    thread.join()


if __name__ == "__main__":
    main()
