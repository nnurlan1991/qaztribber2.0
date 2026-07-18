from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    queued = "queued"
    preparing = "preparing"
    loading_model = "loading_model"
    transcribing = "transcribing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class PreloadStatus(str, Enum):
    idle = "idle"
    downloading = "downloading"
    completed = "completed"
    failed = "failed"


class ModelResponse(BaseModel):
    id: Literal["220m", "600m"]
    title: str
    gigaam_name: str
    parameters: str
    description: str
    cached: bool
    storage_path: str | None = None
    size_bytes: int = Field(ge=0)


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    progress: float = Field(ge=0, le=1)
    stage: str
    error: str | None = None
    model: Literal["220m", "600m"]
    expected_language: Literal["kazakh", "russian", "mixed"]
    filename: str


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
