from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str = "QazTriber"
    host: str = os.getenv("QAZTRIBER_HOST", "127.0.0.1")
    port: int = int(os.getenv("QAZTRIBER_PORT", "8000"))
    max_upload_bytes: int = int(os.getenv("QAZTRIBER_MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))
    @property
    def app_data_dir(self) -> Path:
        """Папка данных, принятая для каждой настольной ОС.

        Модели весят сотни мегабайт, поэтому на Windows используем LocalAppData,
        а не каталог рядом с приложением или временную память.
        """
        configured = os.getenv("QAZTRIBER_DATA_DIR")
        if configured:
            return Path(configured).expanduser()
        if os.name == "nt":
            return Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "QazTriber"
        if sys.platform == "darwin":
            return Path.home() / "Library" / "Application Support" / "QazTriber"
        return Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "QazTriber"

    @property
    def models_dir(self) -> Path:
        return self.app_data_dir / "models"

    @property
    def jobs_dir(self) -> Path:
        return self.app_data_dir / "jobs"

    def ensure_directories(self) -> None:
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
