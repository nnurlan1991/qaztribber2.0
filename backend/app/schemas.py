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
