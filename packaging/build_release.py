"""Собирает Tauri sidecar (PyInstaller бинарь) для текущей ОС.

Запускать после сборки frontend (`cd frontend && npm run build`).
Бинарь кладётся в src-tauri/binaries/qaztriber-backend/ — Tauri включает
его в bundle через `bundle.resources` и запускает при старте приложения.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = ROOT / "frontend" / "dist"
BINARIES_DIR = ROOT / "src-tauri" / "binaries"
DIST = ROOT / "dist"
BUILD = ROOT / "build"
SIDECAR_DIR_NAME = "qaztriber-backend"


def main() -> None:
    if not FRONTEND_DIST.is_dir():
        raise SystemExit("Frontend не собран. Выполните: cd frontend && npm run build")

    separator = ";" if os.name == "nt" else ":"
    BINARIES_DIR.mkdir(parents=True, exist_ok=True)

    target_sidecar = BINARIES_DIR / SIDECAR_DIR_NAME
    if target_sidecar.exists():
        shutil.rmtree(target_sidecar)
    shutil.rmtree(DIST, ignore_errors=True)
    shutil.rmtree(BUILD, ignore_errors=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        SIDECAR_DIR_NAME,
        "--add-data",
        f"{FRONTEND_DIST}{separator}frontend/dist",
        "--collect-all",
        "gigaam",
        "--collect-all",
        "imageio_ffmpeg",
        "--collect-all",
        "hydra",
        "--collect-all",
        "omegaconf",
        "--collect-all",
        "torchaudio",
        "--paths",
        str(ROOT),
        str(ROOT / "packaging" / "launcher.py"),
    ]
    subprocess.run(command, cwd=ROOT, check=True)

    shutil.copytree(DIST / SIDECAR_DIR_NAME, target_sidecar)
    print(f"Sidecar собран: {target_sidecar}")


if __name__ == "__main__":
    main()
