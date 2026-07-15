from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    app_name: str = "QazTriber"
    host: str = os.getenv("QAZTRIBER_HOST", "127.0.0.1")
    port: int = int(os.getenv("QAZTRIBER_PORT", "8000"))
    max_upload_bytes: int = int(os.getenv("QAZTRIBER_MAX_UPLOAD_BYTES", str(1024 * 1024 * 1024)))
    app_data_dir: Path = Path(
        os.getenv(
            "QAZTRIBER_DATA_DIR",
            Path.home() / "Library" / "Application Support" / "QazTriber",
        )
    )

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
