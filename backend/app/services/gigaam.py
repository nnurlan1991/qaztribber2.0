from __future__ import annotations

import gc
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import torch

from .audio import merge_chunk_texts, split_wav


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
    """Скачивает оба чекпойнта заранее, но удерживает в памяти только один."""

    def __init__(self, gigaam: "GigaAMService"):
        self.gigaam = gigaam
        self.status = "idle"
        self.progress = 0.0
        self.stage = "Модели ещё не подготовлены"
        self.error: str | None = None
        self._lock = threading.RLock()

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {"status": self.status, "progress": self.progress, "stage": self.stage, "error": self.error}

    def start(self) -> dict[str, object]:
        with self._lock:
            if self.status == "downloading":
                return self.snapshot()
            self.status = "downloading"
            self.progress = 0.0
            self.stage = "Подготовка загрузки моделей…"
            self.error = None
        threading.Thread(target=self._run, name="qaztriber-model-preload", daemon=True).start()
        return self.snapshot()

    def _run(self) -> None:
        try:
            definitions = list(MODELS.values())
            for index, definition in enumerate(definitions):
                base = index / len(definitions)

                def report(stage: str, fraction: float, base: float = base) -> None:
                    with self._lock:
                        self.stage = stage
                        self.progress = min(0.98, base + fraction / len(definitions))

                self.gigaam.load(definition.id, report)
            self.gigaam.unload()
            with self._lock:
                self.status = "completed"
                self.progress = 1.0
                self.stage = "220M и 600M скачаны: приложение готово к офлайн-работе."
        except Exception as error:
            with self._lock:
                self.status = "failed"
                self.error = str(error)
                self.stage = "Не удалось подготовить модели"


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

    def is_cached(self, model_id: str) -> bool:
        definition = MODELS[model_id]
        return any(self.models_dir.rglob(f"{definition.gigaam_name}*"))

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
            report(f"Загрузка GigaAM {definition.parameters} в память…", 0.12)
            try:
                import gigaam
            except ImportError as error:
                raise RuntimeError("GigaAM не установлен. Выполните установку зависимостей backend.") from error
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
