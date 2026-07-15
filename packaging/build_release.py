"""Собирает нативный лаунчер из текущей ОС. Запускать в GitHub Actions."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = ROOT / "frontend" / "dist"
DIST = ROOT / "dist"
BUILD = ROOT / "build"


def main() -> None:
    if not FRONTEND_DIST.is_dir():
        raise SystemExit("Frontend не собран. Выполните: cd frontend && npm run build")

    separator = ";" if os.name == "nt" else ":"
    for path in (DIST, BUILD):
        shutil.rmtree(path, ignore_errors=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--onedir",
        "--name",
        "QazTriber",
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


if __name__ == "__main__":
    main()
