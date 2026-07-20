from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    queued = "queued"
    preparing = "preparing"
    loading_model = "loading_model"
    transcribing = "transcribing"
    paused = "paused"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class PreloadStatus(str, Enum):
    idle = "idle"
    downloading = "downloading"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    paused = "paused"


class ModelResponse(BaseModel):
    id: Literal["220m", "600m"]
    title: str
    gigaam_name: str
    parameters: str
    description: str
    cached: bool
    storage_path: str | None = None
    size_bytes: int = Field(ge=0)


class StageStatus(BaseModel):
    name: str  # "audio_preparation" | "model_download" | "model_load" | "transcription" | "merging" | "done"
    status: Literal["pending", "in_progress", "completed", "failed"]
    progress: float = Field(ge=0, le=1, default=0.0)
    detail: str = ""


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    progress: float = Field(ge=0, le=1)
    stage: str
    error: str | None = None
    error_code: str | None = None
    model: Literal["220m", "600m"]
    expected_language: Literal["kazakh", "russian", "mixed"]
    filename: str
    stages: list[StageStatus] = Field(default_factory=list)


class ResultResponse(BaseModel):
    id: str
    text: str
    model: Literal["220m", "600m"]
    expected_language: Literal["kazakh", "russian", "mixed"]
    duration_seconds: float | None = None


class PreloadResponse(BaseModel):
    status: PreloadStatus
    progress: float = Field(ge=0, le=1)
    stage: str
    error: str | None = None
    error_code: str | None = None


class SessionResponse(BaseModel):
    id: str
    status: str  # "completed" | "interrupted" | "failed" | "active"
    created_at: float  # Unix timestamp
    filename: str | None = None
    model: str | None = None
    expected_language: str | None = None
    has_result: bool
    has_source: bool
    duration_seconds: float | None = None
    error: str | None = None


class SystemInfoResponse(BaseModel):
    device: str
    cpu_count: int
    cpu_brand: str
    memory_gb: float
    os: str
    arch: str
    #粗 бенчмарк: множитель скорости относительно реального времени
    # 1.0 = транскрипция идёт 1:1 с длительностью аудио
    # 0.4 = транскрипция в 2.5x быстрее реального времени
    speed_multiplier_220m: float
    speed_multiplier_600m: float
