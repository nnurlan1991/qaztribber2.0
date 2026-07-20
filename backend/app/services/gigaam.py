from __future__ import annotations

import gc
import hashlib
import json
import logging
import os
import socket
import threading
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import torch

logger = logging.getLogger(__name__)

from .audio import ffmpeg_executable, merge_chunk_texts, split_wav

MODEL_DOWNLOAD_BASE = "https://qaztribber.aidi-lab.kz/models/desktop"


@dataclass(frozen=True)
class ModelDefinition:
    id: str
    title: str
    gigaam_name: str
    parameters: str
    description: str


MODELS: dict[str, ModelDefinition] = {
    "220m": ModelDefinition(
        id="220m",
        title="Быстрая — 220M",
        gigaam_name="multilingual_ctc",
        parameters="220M",
        description="Быстрая локальная расшифровка казахской и русской речи.",
    ),
    "600m": ModelDefinition(
        id="600m",
        title="Точная — 600M",
        gigaam_name="multilingual_large_ctc",
        parameters="600M",
        description="Максимальная точность; требует больше памяти и времени загрузки.",
    ),
}


class ModelPreloadManager:
    """Скачивает чекпойнты на диск и сообщает честный прогресс скачивания."""

    def __init__(self, gigaam: "GigaAMService"):
        self.gigaam = gigaam
        self.status = "idle"
        self.progress = 0.0
        self.stage = "Модели ещё не подготовлены"
        self.error: str | None = None
        self._lock = threading.RLock()
        self._cancelled = threading.Event()
        self._restore_status()

    # ------------------------------------------------------------------
    # snapshot / start / cancel
    # ------------------------------------------------------------------

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {"status": self.status, "progress": self.progress, "stage": self.stage, "error": self.error}

    def start(self) -> dict[str, object]:
        with self._lock:
            if self.status == "downloading":
                return self.snapshot()
            self._cancelled.clear()
            self.status = "downloading"
            self.progress = 0.0
            self.stage = "Подготовка загрузки моделей…"
            self.error = None
        threading.Thread(target=self._run, name="qaztriber-model-preload", daemon=True).start()
        return self.snapshot()

    def cancel(self) -> dict[str, object]:
        """Request cancellation of ongoing download. Returns current snapshot."""
        with self._lock:
            self._cancelled.set()
            if self.status == "downloading":
                self.status = "cancelled"
                self.stage = "Загрузка отменена пользователем"
            self._persist_status()
        return self.snapshot()

    # ------------------------------------------------------------------
    # persistence
    # ------------------------------------------------------------------

    def _persist_status(self) -> None:
        """Persist download status to downloads.json for recovery across restarts."""
        try:
            from ..config import settings

            with self._lock:
                status_data = {
                    "status": self.status,
                    "progress": self.progress,
                    "stage": self.stage,
                    "error": self.error,
                    "timestamp": time.time(),
                }
            settings.downloads_status_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = settings.downloads_status_path.with_suffix(".json.tmp")
            temp_path.write_text(
                json.dumps(status_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            os.replace(temp_path, settings.downloads_status_path)
        except (OSError, json.JSONDecodeError):
            pass  # best-effort

    def _restore_status(self) -> None:
        """Restore download status from downloads.json. In-progress downloads become 'paused'."""
        try:
            from ..config import settings

            if not settings.downloads_status_path.is_file():
                return
            data = json.loads(settings.downloads_status_path.read_text(encoding="utf-8"))
            persisted_status = data.get("status", "idle")
            if persisted_status == "downloading":
                self.status = "paused"
                self.progress = data.get("progress", 0.0)
                self.stage = "Загрузка прервана. Нажмите «Продолжить» для возобновления."
            else:
                self.status = persisted_status
                self.progress = data.get("progress", 0.0)
                self.stage = data.get("stage", "Модели ещё не подготовлены")
                self.error = data.get("error")
        except (OSError, json.JSONDecodeError):
            pass  # best-effort

    # ------------------------------------------------------------------
    # download loop
    # ------------------------------------------------------------------

    def _run(self) -> None:
        try:
            self._cancelled.clear()
            definitions = list(MODELS.values())
            for index, definition in enumerate(definitions):
                if self._cancelled.is_set():
                    break

                base = index / len(definitions)

                def report(stage: str, fraction: float, base: float = base) -> None:
                    with self._lock:
                        if self._cancelled.is_set():
                            return
                        self.stage = stage
                        self.progress = min(0.98, base + fraction / len(definitions))

                self.gigaam.ensure_download(definition.id, report, self._cancelled.is_set)
                self._persist_status()

                if self._cancelled.is_set():
                    break

            with self._lock:
                if self._cancelled.is_set():
                    self.status = "cancelled"
                    self.stage = "Загрузка отменена пользователем"
                else:
                    self.status = "completed"
                    self.progress = 1.0
                    self.stage = "220M и 600M скачаны: приложение готово к офлайн-работе."
                self._persist_status()
        except Exception as error:
            with self._lock:
                self.status = "failed"
                self.error = str(error)
                self.stage = "Не удалось подготовить модели"
                self._persist_status()


class GigaAMService:
    """Потокобезопасный singleton: в памяти находится максимум одна модель."""

    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self._model = None
        self._active_model_id: str | None = None
        self._lock = threading.RLock()

    @staticmethod
    def device() -> str:
        return "mps" if torch.backends.mps.is_available() else "cpu"

    @staticmethod
    def _configure_bundled_ffmpeg() -> None:
        """Направляет внутренний вызов GigaAM на FFmpeg из установщика.

        GigaAM вызывает команду ``ffmpeg`` напрямую даже для уже нормализованного
        WAV. В Windows-пакете системный FFmpeg отсутствует, но imageio-ffmpeg
        поставляет собственный бинарник с другим именем.
        """
        import gigaam.preprocess as preprocess

        if getattr(preprocess, "_qaztriber_ffmpeg_configured", False):
            return
        original_run = preprocess.run

        def bundled_run(command: list[str], *args: object, **kwargs: object):
            if command and command[0] == "ffmpeg":
                command = [ffmpeg_executable(), *command[1:]]
            return original_run(command, *args, **kwargs)

        preprocess.run = bundled_run
        preprocess._qaztriber_ffmpeg_configured = True

    def is_cached(self, model_id: str) -> bool:
        return self.model_path(model_id).is_file()

    def model_path(self, model_id: str) -> Path:
        if model_id not in MODELS:
            raise ValueError("Допустимы только модели 220M и 600M.")
        return self.models_dir / f"{MODELS[model_id].gigaam_name}.ckpt"

    def model_info(self, model_id: str) -> dict[str, object]:
        path = self.model_path(model_id)
        return {
            "cached": path.is_file(),
            "storage_path": str(path) if path.is_file() else None,
            "size_bytes": path.stat().st_size if path.is_file() else 0,
        }

    @staticmethod
    def _format_bytes(value: int) -> str:
        return f"{value / (1024 * 1024):.0f} МБ"

    @staticmethod
    def _checksum(path: Path) -> str:
        digest = hashlib.md5()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def ensure_download(
        self,
        model_id: str,
        report: Callable[[str, float], None],
        cancelled: Callable[[], bool] | None = None,
    ) -> None:
        """Скачивает checkpoint с прогрессом и атомарно сохраняет его на диск."""
        if model_id not in MODELS:
            raise ValueError("Допустимы только модели 220M и 600M.")
        with self._lock:
            definition = MODELS[model_id]
            target = self.model_path(model_id)
            self.models_dir.mkdir(parents=True, exist_ok=True)
            import gigaam

            expected_hash = gigaam._MODEL_HASHES[definition.gigaam_name]
            if target.is_file() and self._checksum(target) == expected_hash:
                report(f"GigaAM {definition.parameters} уже сохранена на диске.", 1.0)
                return
            if target.exists():
                target.unlink()
            temporary = target.with_suffix(".ckpt.part")
            url = f"{MODEL_DOWNLOAD_BASE}/{definition.gigaam_name}.ckpt"

            # Check for existing partial file for resume
            existing_size = 0
            if temporary.is_file():
                existing_size = temporary.stat().st_size
                if existing_size > 0:
                    logger.info(
                        "Found partial download of %s: %s, attempting resume",
                        definition.parameters,
                        self._format_bytes(existing_size),
                    )
                    report(
                        f"Возобновление загрузки {definition.parameters} "
                        f"с {self._format_bytes(existing_size)}…",
                        0.0,
                    )
                else:
                    temporary.unlink(missing_ok=True)
            else:
                report(f"Подключение к серверу GigaAM {definition.parameters}…", 0.0)

            try:
                # Build request with Range header if resuming
                headers: dict[str, str] = {}
                mode = "wb"
                if existing_size > 0:
                    headers["Range"] = f"bytes={existing_size}-"
                    mode = "ab"

                request = urllib.request.Request(url, headers=headers)

                with urllib.request.urlopen(request, timeout=30) as response:
                    status_code = response.getcode()

                    # Check if server supports Range
                    if existing_size > 0 and status_code == 200:
                        # Server doesn't support Range — start fresh
                        logger.info(
                            "Server doesn't support Range for %s, starting fresh download",
                            definition.parameters,
                        )
                        existing_size = 0
                        mode = "wb"
                        report(
                            "Сервер не поддерживает возобновление. Начинаем загрузку заново…",
                            0.0,
                        )
                    elif existing_size > 0 and status_code == 206:
                        logger.info(
                            "Server supports Range, resuming %s from byte %d",
                            definition.parameters,
                            existing_size,
                        )

                    # Determine total size
                    content_length = int(response.headers.get("Content-Length", "0"))
                    content_range = response.headers.get("Content-Range", "")

                    if content_range and "/" in content_range:
                        # Format: "bytes start-end/total"
                        total = int(content_range.split("/")[1])
                    elif existing_size > 0 and status_code == 206:
                        total = existing_size + content_length
                    else:
                        total = content_length

                    received = existing_size

                    with temporary.open(mode) as output:
                        while chunk := response.read(1024 * 1024):
                            if cancelled and cancelled():
                                logger.info(
                                    "Download of %s cancelled by user",
                                    definition.parameters,
                                )
                                raise InterruptedError("Загрузка отменена пользователем")
                            output.write(chunk)
                            received += len(chunk)
                            if total:
                                fraction = min(received / total, 0.99)
                                report(
                                    f"Скачивание {definition.parameters}: "
                                    f"{self._format_bytes(received)} / {self._format_bytes(total)}",
                                    fraction,
                                )
                            else:
                                report(
                                    f"Скачивание {definition.parameters}: {self._format_bytes(received)}",
                                    0.0,
                                )

                report(f"Проверка файла GigaAM {definition.parameters}…", 0.995)
                if self._checksum(temporary) != expected_hash:
                    temporary.unlink(missing_ok=True)  # Corrupted — delete
                    raise RuntimeError("контрольная сумма не совпала; файл не сохранён")

                os.replace(temporary, target)
                logger.info("Download of %s completed successfully", definition.parameters)

            except InterruptedError:
                raise
            except socket.timeout as error:
                logger.error(
                    "Download timeout for %s: %s. Partial file preserved at %s",
                    definition.parameters,
                    error,
                    temporary,
                )
                raise RuntimeError(
                    f"Таймаут загрузки GigaAM {definition.parameters}: {error}"
                ) from error
            except Exception as error:
                if "контрольная сумма" in str(error):
                    raise  # Checksum failure already handled above
                logger.error(
                    "Download failed for %s: %s. Partial file preserved at %s",
                    definition.parameters,
                    error,
                    temporary,
                )
                raise RuntimeError(
                    f"Не удалось скачать GigaAM {definition.parameters}: {error}"
                ) from error

            report(f"GigaAM {definition.parameters} сохранена на диске.", 1.0)

    def delete(self, model_id: str) -> None:
        """Удаляет сохранённую модель и освобождает занятую ею память, если нужно."""
        with self._lock:
            if self._active_model_id == model_id:
                self.unload()
            self.model_path(model_id).unlink(missing_ok=True)
            self.model_path(model_id).with_suffix(".ckpt.part").unlink(missing_ok=True)

    def unload(self) -> None:
        self._model = None
        self._active_model_id = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if torch.backends.mps.is_available():
            try:
                torch.mps.empty_cache()
            except RuntimeError:
                pass
        gc.collect()

    def load(self, model_id: str, report: Callable[[str, float], None]) -> None:
        if model_id not in MODELS:
            raise ValueError("Допустимы только модели 220M и 600M.")
        with self._lock:
            if self._active_model_id == model_id and self._model is not None:
                return
            self.unload()
            definition = MODELS[model_id]
            self.ensure_download(model_id, lambda stage, fraction: report(stage, fraction * 0.22), lambda: False)
            report(f"Загрузка GigaAM {definition.parameters} в память…", 0.24)
            try:
                import gigaam
            except ImportError as error:
                raise RuntimeError("GigaAM не установлен. Выполните установку зависимостей backend.") from error
            self._configure_bundled_ffmpeg()
            self._model = gigaam.load_model(
                definition.gigaam_name,
                device=self.device(),
                download_root=str(self.models_dir),
            )
            self._active_model_id = model_id
            report(f"GigaAM {definition.parameters} готова.", 0.3)

    def transcribe(
        self,
        model_id: str,
        wav_path: Path,
        chunks_dir: Path,
        report: Callable[[str, float], None],
        cancelled: Callable[[], bool],
    ) -> str:
        self.load(model_id, report)
        chunks = split_wav(wav_path, chunks_dir)
        texts: list[str] = []
        for index, chunk_path in enumerate(chunks, start=1):
            if cancelled():
                raise InterruptedError("Задача отменена пользователем.")
            fraction = 0.3 + 0.65 * ((index - 1) / len(chunks))
            report(f"Распознавание фрагмента {index}/{len(chunks)}…", fraction)
            with self._lock:
                raw_text = self._model.transcribe(str(chunk_path))
            if hasattr(raw_text, "text"):
                raw_text = raw_text.text
            texts.append(str(raw_text).strip())
        report("Объединение результата…", 0.97)
        return merge_chunk_texts(texts)
