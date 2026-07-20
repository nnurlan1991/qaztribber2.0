from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path


def init_logging(data_dir: Path) -> None:
    """Configure Python logging with RotatingFileHandler for the sidecar.

    Overrides uvicorn's default log configuration. Logs are written to
    ``{data_dir}/logs/sidecar.log`` with rotation at 5 MB and 3 backups.
    """
    log_dir = data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    level = logging.DEBUG if os.environ.get("QAZTRIBER_DEBUG") == "1" else logging.INFO

    handler = RotatingFileHandler(
        log_dir / "sidecar.log",
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s:%(lineno)d — %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    )

    logging.basicConfig(level=level, handlers=[handler], force=True)
