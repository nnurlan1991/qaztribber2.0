from __future__ import annotations

import shutil
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..schemas import JobStatus
from .audio import run_ffmpeg, wav_duration_seconds
from .gigaam import GigaAMService


@dataclass
class Job:
    id: str
    model: str
    expected_language: str
    filename: str
    directory: Path
    source_path: Path
    start_seconds: float | None
    end_seconds: float | None
    status: JobStatus = JobStatus.queued
    progress: float = 0.0
    stage: str = "В очереди"
    error: str | None = None
    text: str | None = None
    duration_seconds: float | None = None
    cancelled: bool = False
    revision: int = 0
    condition: threading.Condition = field(default_factory=lambda: threading.Condition(threading.RLock()))

    def update(self, status: JobStatus, stage: str, progress: float) -> None:
        with self.condition:
            self.status = status
            self.stage = stage
            self.progress = max(0.0, min(1.0, progress))
            self.revision += 1
            self.condition.notify_all()


class JobManager:
    def __init__(self, jobs_dir: Path, gigaam: GigaAMService):
        self.jobs_dir = jobs_dir
        self.gigaam = gigaam
        self._jobs: dict[str, Job] = {}
        self._queue: list[str] = []
        self._lock = threading.RLock()
        self._wake = threading.Condition(self._lock)
        self._worker = threading.Thread(target=self._run, name="qaztriber-asr", daemon=True)
        self._worker.start()

    def create(self, model: str, expected_language: str, filename: str, start_seconds: float | None, end_seconds: float | None) -> Job:
        job_id = str(uuid.uuid4())
        directory = self.jobs_dir / job_id
        directory.mkdir(parents=True, exist_ok=False)
        source_path = directory / "source"
        job = Job(job_id, model, expected_language, filename, directory, source_path, start_seconds, end_seconds)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def enqueue(self, job: Job) -> None:
        """Ставим задачу в очередь только после полной записи upload-файла."""
        with self._wake:
            self._queue.append(job.id)
            self._wake.notify()

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> Job | None:
        job = self.get(job_id)
        if job is None:
            return None
        with job.condition:
            job.cancelled = True
            if job.status == JobStatus.queued:
                job.status = JobStatus.cancelled
                job.stage = "Отменено пользователем"
                job.revision += 1
                job.condition.notify_all()
        return job

    def delete(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status in {JobStatus.preparing, JobStatus.loading_model, JobStatus.transcribing}:
                return False
            self._jobs.pop(job_id)
        shutil.rmtree(job.directory, ignore_errors=True)
        return True

    def _next_job(self) -> Job:
        with self._wake:
            while True:
                while not self._queue:
                    self._wake.wait()
                job_id = self._queue.pop(0)
                job = self._jobs.get(job_id)
                if job and not job.cancelled:
                    return job

    def _run(self) -> None:
        while True:
            job = self._next_job()
            try:
                self._process(job)
            except InterruptedError:
                job.update(JobStatus.cancelled, "Отменено пользователем", job.progress)
            except Exception as error:  # User receives a safe message via API.
                job.error = str(error)
                job.update(JobStatus.failed, "Ошибка обработки", job.progress)

    def _process(self, job: Job) -> None:
        if job.cancelled:
            raise InterruptedError
        job.update(JobStatus.preparing, "Подготовка аудио…", 0.03)
        wav_path = job.directory / "normalized.wav"
        run_ffmpeg(job.source_path, wav_path, job.start_seconds, job.end_seconds)
        job.duration_seconds = wav_duration_seconds(wav_path)
        if job.cancelled:
            raise InterruptedError

        def report(stage: str, progress: float) -> None:
            status = JobStatus.loading_model if progress <= 0.3 else JobStatus.transcribing
            job.update(status, stage, progress)

        text = self.gigaam.transcribe(
            job.model,
            wav_path,
            job.directory / "chunks",
            report,
            lambda: job.cancelled,
        )
        if job.cancelled:
            raise InterruptedError
        job.text = text
        job.update(JobStatus.completed, "Готово", 1.0)
