from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from ..config import settings
from ..schemas import JobResponse, JobStatus, ModelResponse, PreloadResponse, ResultResponse
from ..services.gigaam import MODELS, ModelPreloadManager
from ..services.jobs import Job, JobManager

router = APIRouter(prefix="/api", tags=["transcriptions"])
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"}


def manager(request: Request) -> JobManager:
    return request.app.state.jobs


def job_response(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        status=job.status,
        progress=job.progress,
        stage=job.stage,
        error=job.error,
        model=job.model,  # type: ignore[arg-type]
        expected_language=job.expected_language,  # type: ignore[arg-type]
        filename=job.filename,
    )


def get_job(request: Request, job_id: str) -> Job:
    job = manager(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена.")
    return job


@router.get("/models", response_model=list[ModelResponse])
def models(request: Request) -> list[ModelResponse]:
    gigaam = request.app.state.gigaam
    return [
        ModelResponse(**definition.__dict__, **gigaam.model_info(model_id))
        for model_id, definition in MODELS.items()
    ]


def preload_response(preload: ModelPreloadManager) -> PreloadResponse:
    snapshot = preload.snapshot()
    return PreloadResponse(**snapshot)  # type: ignore[arg-type]


@router.get("/models/preload", response_model=PreloadResponse)
def preload_status(request: Request) -> PreloadResponse:
    return preload_response(request.app.state.preload)


@router.post("/models/preload", response_model=PreloadResponse, status_code=202)
def preload_models(request: Request) -> PreloadResponse:
    return preload_response(request.app.state.preload) if request.app.state.preload.status == "downloading" else PreloadResponse(**request.app.state.preload.start())  # type: ignore[arg-type]


@router.delete("/models/{model_id}", status_code=204)
def delete_model(request: Request, model_id: str) -> None:
    if model_id not in MODELS:
        raise HTTPException(status_code=404, detail="Модель не найдена.")
    preload = request.app.state.preload
    if preload.status == "downloading":
        raise HTTPException(status_code=409, detail="Дождитесь окончания текущей загрузки моделей.")
    request.app.state.gigaam.delete(model_id)


@router.post("/transcriptions", response_model=JobResponse, status_code=202)
async def create_transcription(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form(...),
    expected_language: str = Form("mixed"),
    start_seconds: float | None = Form(None),
    end_seconds: float | None = Form(None),
) -> JobResponse:
    if model not in MODELS:
        raise HTTPException(status_code=422, detail="Выберите GigaAM 220M или 600M.")
    if expected_language not in {"kazakh", "russian", "mixed"}:
        raise HTTPException(status_code=422, detail="Допустимы языки: казахский, русский или смешанный.")
    filename = file.filename or "recording.webm"
    if Path(filename).suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Поддерживаются WAV, MP3, M4A, FLAC, OGG и WEBM.")
    if start_seconds is not None and start_seconds < 0:
        raise HTTPException(status_code=422, detail="Начало обрезки не может быть отрицательным.")
    if end_seconds is not None and end_seconds <= (start_seconds or 0):
        raise HTTPException(status_code=422, detail="Конец обрезки должен быть позже начала.")

    job = manager(request).create(model, expected_language, Path(filename).name, start_seconds, end_seconds)
    received = 0
    try:
        with job.source_path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                received += len(chunk)
                if received > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="Аудиофайл превышает разрешённый размер.")
                destination.write(chunk)
    except Exception:
        manager(request).cancel(job.id)
        manager(request).delete(job.id)
        raise
    finally:
        await file.close()
    manager(request).enqueue(job)
    return job_response(job)


@router.get("/transcriptions/{job_id}", response_model=JobResponse)
def transcription(request: Request, job_id: str) -> JobResponse:
    return job_response(get_job(request, job_id))


@router.get("/transcriptions/{job_id}/events")
async def transcription_events(request: Request, job_id: str) -> StreamingResponse:
    job = get_job(request, job_id)

    async def stream():
        revision = -1
        while True:
            if await request.is_disconnected():
                break
            with job.condition:
                if revision != job.revision:
                    revision = job.revision
                    payload = job_response(job).model_dump(mode="json")
                    message = f"event: progress\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                else:
                    message = None
                done = job.status in {JobStatus.completed, JobStatus.failed, JobStatus.cancelled}
            if message:
                yield message
            if done:
                break
            await asyncio.sleep(0.35)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.post("/transcriptions/{job_id}/cancel", response_model=JobResponse)
def cancel_transcription(request: Request, job_id: str) -> JobResponse:
    job = manager(request).cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Задача не найдена.")
    return job_response(job)


@router.get("/transcriptions/{job_id}/result", response_model=ResultResponse)
def transcription_result(request: Request, job_id: str) -> ResultResponse:
    job = get_job(request, job_id)
    if job.status != JobStatus.completed or job.text is None:
        raise HTTPException(status_code=409, detail="Результат ещё не готов.")
    return ResultResponse(id=job.id, text=job.text, model=job.model, expected_language=job.expected_language, duration_seconds=job.duration_seconds)  # type: ignore[arg-type]


@router.get("/transcriptions/{job_id}/result.txt")
def transcription_txt(request: Request, job_id: str) -> FileResponse:
    job = get_job(request, job_id)
    if job.status != JobStatus.completed or job.text is None:
        raise HTTPException(status_code=409, detail="Результат ещё не готов.")
    result_path = job.directory / "transcription.txt"
    result_path.write_text(job.text, encoding="utf-8")
    return FileResponse(result_path, media_type="text/plain; charset=utf-8", filename="qaztriber-transcription.txt")


@router.delete("/transcriptions/{job_id}", status_code=204)
def delete_transcription(request: Request, job_id: str) -> None:
    if not manager(request).delete(job_id):
        raise HTTPException(status_code=409, detail="Задачу нельзя удалить во время обработки.")
