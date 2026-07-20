from __future__ import annotations

import json
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import Settings


def make_client(tmp_path: Path) -> TestClient:
    """Set up app.state.jobs with a real JobManager and patch settings to use tmp_path."""
    import backend.app.config as config
    import backend.app.api.transcriptions as api_mod
    from backend.app.services.jobs import JobManager

    # Create a new Settings instance that reads QAZTRIBER_DATA_DIR from env
    os.environ["QAZTRIBER_DATA_DIR"] = str(tmp_path)
    test_settings = Settings()

    # Ensure directories exist
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)

    # Patch settings in both modules
    config.settings = test_settings
    api_mod.settings = test_settings

    # Fake GigaAM — JobManager.__init__ only stores the reference, doesn't call it
    class FakeGigaAM:
        pass

    # Set up app.state.jobs with a real JobManager
    app.state.jobs = JobManager(jobs_dir, FakeGigaAM())  # type: ignore[arg-type]

    client = TestClient(app)
    client._jobs_dir = jobs_dir  # type: ignore[attr-defined]
    return client


def _cleanup_client(client: TestClient) -> None:
    """Remove app.state.jobs so future tests get a fresh setup."""
    if hasattr(client, "_jobs_dir"):
        del client._jobs_dir
    if hasattr(app.state, "jobs"):
        del app.state.jobs


def test_list_sessions_empty(tmp_path: Path) -> None:
    """No jobs directory — returns empty list."""
    client = make_client(tmp_path)
    try:
        response = client.get("/api/sessions")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        _cleanup_client(client)


def test_list_sessions_with_completed_job(tmp_path: Path) -> None:
    """Create job dir with metadata.json + transcription.txt — status='completed', has_result=True."""
    jobs_dir = tmp_path / "jobs"
    job_dir = jobs_dir / "test-job-1"
    job_dir.mkdir(parents=True)

    now = time.time()
    metadata = {
        "id": "test-job-1",
        "model": "220m",
        "expected_language": "kazakh",
        "filename": "test.wav",
        "created_at": now,
        "status": "completed",
        "duration_seconds": 12.5,
    }
    (job_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (job_dir / "transcription.txt").write_text("Сәлем әлем", encoding="utf-8")

    client = make_client(tmp_path)
    try:
        response = client.get("/api/sessions")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 1
        session = data[0]
        assert session["id"] == "test-job-1"
        assert session["status"] == "completed"
        assert session["has_result"] is True
        assert session["has_source"] is False
        assert session["filename"] == "test.wav"
        assert session["model"] == "220m"
        assert session["expected_language"] == "kazakh"
        assert session["duration_seconds"] == 12.5
        assert session["error"] is None
    finally:
        _cleanup_client(client)


def test_list_sessions_with_interrupted_job(tmp_path: Path) -> None:
    """Create job dir with source but no transcription.txt and no metadata — status='interrupted'."""
    jobs_dir = tmp_path / "jobs"
    job_dir = jobs_dir / "interrupted-job"
    job_dir.mkdir(parents=True)
    (job_dir / "source").write_bytes(b"fake audio data")

    client = make_client(tmp_path)
    try:
        response = client.get("/api/sessions")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 1
        session = data[0]
        assert session["id"] == "interrupted-job"
        assert session["status"] == "interrupted"
        assert session["has_result"] is False
        assert session["has_source"] is True
    finally:
        _cleanup_client(client)


def test_list_sessions_sorted_by_created_at_desc(tmp_path: Path) -> None:
    """Create 3 jobs with different timestamps — newest first."""
    jobs_dir = tmp_path / "jobs"

    base_time = 1_700_000_000.0
    for i, ts in enumerate([base_time, base_time + 100, base_time + 200]):
        job_id = f"job-{i}"
        job_dir = jobs_dir / job_id
        job_dir.mkdir(parents=True)
        metadata = {
            "id": job_id,
            "created_at": ts,
            "filename": f"test-{i}.wav",
        }
        (job_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    client = make_client(tmp_path)
    try:
        response = client.get("/api/sessions")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 3
        ids = [s["id"] for s in data]
        assert ids == ["job-2", "job-1", "job-0"]
    finally:
        _cleanup_client(client)


def test_metadata_json_persisted_on_create(tmp_path: Path) -> None:
    """Create a job via JobManager — verify metadata.json is written."""
    from backend.app.services.jobs import JobManager

    class FakeGigaAM:
        pass  # Not needed for create()

    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True)
    manager = JobManager(jobs_dir, FakeGigaAM())  # type: ignore[arg-type]
    job = manager.create("600m", "russian", "recording.mp3", 0.0, 60.0)

    metadata_path = job.directory / "metadata.json"
    assert metadata_path.is_file(), "metadata.json должен быть создан"

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["id"] == job.id
    assert metadata["model"] == "600m"
    assert metadata["expected_language"] == "russian"
    assert metadata["filename"] == "recording.mp3"
    assert metadata["start_seconds"] == 0.0
    assert metadata["end_seconds"] == 60.0
    assert isinstance(metadata["created_at"], float)
    assert metadata["created_at"] > 0
