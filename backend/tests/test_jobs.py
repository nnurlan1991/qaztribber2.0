from __future__ import annotations

import time

import numpy as np
import soundfile as sf

from backend.app.schemas import JobStatus
from backend.app.services.jobs import JobManager


class FakeGigaAM:
    def transcribe(self, model, wav_path, chunks_dir, report, cancelled):
        assert model == "220m"
        assert wav_path.exists()
        assert not cancelled()
        report("Распознавание фрагмента 1/1…", 0.8)
        return "Сәлем әлем"


def test_job_manager_runs_audio_pipeline(tmp_path) -> None:
    manager = JobManager(tmp_path / "jobs", FakeGigaAM())
    job = manager.create("220m", "mixed", "sample.wav", None, None)
    sf.write(job.source_path, np.zeros(1600, dtype=np.float32), 16000, format="WAV")
    manager.enqueue(job)

    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and job.status not in {JobStatus.completed, JobStatus.failed}:
        time.sleep(0.05)

    assert job.status == JobStatus.completed, job.error
    assert job.text == "Сәлем әлем"
    assert job.duration_seconds == 0.1
    assert manager.delete(job.id)
