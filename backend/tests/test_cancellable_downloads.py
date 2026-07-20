"""
Tests for Task 2.3: Cancellable model downloads + persistent status.

Covers:
- ModelPreloadManager._cancelled threading.Event
- cancel() sets event and updates status
- _run() checks _cancelled.is_set() between models
- start() clears _cancelled before starting
- _persist_status() writes to downloads.json
- _restore_status() reads downloads.json, converts "downloading" → "paused"
- POST /api/models/preload/cancel endpoint
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.app.services.gigaam import GigaAMService, MODELS, ModelPreloadManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def gigaam_service(tmp_path: Path) -> GigaAMService:
    return GigaAMService(tmp_path / "models")


@pytest.fixture
def preload_manager(gigaam_service: GigaAMService) -> ModelPreloadManager:
    return ModelPreloadManager(gigaam_service)


# ---------------------------------------------------------------------------
# 1. _cancelled = threading.Event() in __init__
# ---------------------------------------------------------------------------


def test_preload_manager_has_cancelled_event(preload_manager: ModelPreloadManager) -> None:
    """ModelPreloadManager initialises _cancelled as a threading.Event."""
    assert hasattr(preload_manager, "_cancelled")
    assert isinstance(preload_manager._cancelled, threading.Event)
    # Fresh event should be cleared (not set)
    assert preload_manager._cancelled.is_set() is False


# ---------------------------------------------------------------------------
# 2. cancel() sets the event and updates status
# ---------------------------------------------------------------------------


def test_cancel_sets_event_and_updates_status_when_downloading(
    gigaam_service: GigaAMService,
) -> None:
    """cancel() during 'downloading' sets the event and updates status to 'cancelled'."""
    mgr = ModelPreloadManager(gigaam_service)

    # Force status to downloading without actually starting a thread
    mgr.status = "downloading"
    mgr._cancelled.clear()

    snapshot = mgr.cancel()

    assert mgr._cancelled.is_set()
    assert snapshot["status"] == "cancelled"
    assert "Загрузка отменена пользователем" in str(snapshot["stage"])
    assert snapshot["error_code"] == "cancelled"


def test_cancel_sets_event_but_keeps_status_when_idle(
    gigaam_service: GigaAMService,
) -> None:
    """cancel() when not downloading: sets the event but does NOT change status to 'cancelled'."""
    mgr = ModelPreloadManager(gigaam_service)

    mgr.status = "idle"
    mgr._cancelled.clear()

    snapshot = mgr.cancel()

    assert mgr._cancelled.is_set()
    assert snapshot["status"] == "idle"


def test_cancel_sets_event_when_completed(
    gigaam_service: GigaAMService,
) -> None:
    """cancel() when completed: sets the event, status stays 'completed'."""
    mgr = ModelPreloadManager(gigaam_service)

    mgr.status = "completed"
    mgr._cancelled.clear()

    snapshot = mgr.cancel()

    assert mgr._cancelled.is_set()
    assert snapshot["status"] == "completed"


def test_cancel_sets_event_when_failed(
    gigaam_service: GigaAMService,
) -> None:
    """cancel() when failed: sets the event, status stays 'failed'."""
    mgr = ModelPreloadManager(gigaam_service)

    mgr.status = "failed"
    mgr._cancelled.clear()

    snapshot = mgr.cancel()

    assert mgr._cancelled.is_set()
    assert snapshot["status"] == "failed"


# ---------------------------------------------------------------------------
# 3. _run() checks _cancelled.is_set() between models
# ---------------------------------------------------------------------------


def test_run_stops_on_cancelled_between_models(
    gigaam_service: GigaAMService,
    tmp_path: Path,
) -> None:
    """_run() checks _cancelled.is_set() in the model loop and breaks out."""
    mgr = ModelPreloadManager(gigaam_service)

    call_count = {"count": 0}

    def fake_ensure(model_id: str, report, cancelled=None) -> None:
        call_count["count"] += 1
        report(f"Downloaded {model_id}", 1.0)
        # Cancel after the first model (220m) finishes
        if call_count["count"] == 1:
            mgr._cancelled.set()

    with patch.object(gigaam_service, "ensure_download", side_effect=fake_ensure):
        mgr._cancelled.clear()
        mgr.status = "downloading"

        mgr._run()

        # _run should stop after 220m, never reach 600m
        assert call_count["count"] == 1
        assert mgr.status == "cancelled"


def test_run_check_just_before_model_download(
    gigaam_service: GigaAMService,
    tmp_path: Path,
) -> None:
    """If cancelled during the first ensure_download, _run stops after that model."""
    mgr = ModelPreloadManager(gigaam_service)

    call_count = {"count": 0}

    def fake_ensure(model_id: str, report, cancelled=None) -> None:
        call_count["count"] += 1
        # Set cancelled flag during the first download — _run should
        # break before the second model even if this one still runs
        mgr._cancelled.set()

    with patch.object(gigaam_service, "ensure_download", side_effect=fake_ensure):
        mgr.status = "downloading"

        mgr._run()

        # Should have called ensure_download for 220m only,
        # then broken out before 600m
        assert call_count["count"] == 1
        assert mgr.status == "cancelled"


# ---------------------------------------------------------------------------
# 4. start() clears _cancelled before starting
# ---------------------------------------------------------------------------


def test_start_clears_cancelled_event(gigaam_service: GigaAMService) -> None:
    """start() clears _cancelled event before launching the thread."""
    mgr = ModelPreloadManager(gigaam_service)

    # Seed a stale cancelled state
    mgr._cancelled.set()
    mgr.status = "cancelled"

    # Mock ensure_download so the background thread doesn't try to do real work
    with patch.object(gigaam_service, "ensure_download", return_value=None):
        snapshot = mgr.start()

        # After start(), _cancelled must be cleared
        assert mgr._cancelled.is_set() is False
        assert snapshot["status"] == "downloading"
        assert snapshot["progress"] == 0.0
        assert "Подготовка загрузки" in str(snapshot["stage"])


def test_start_returns_snapshot_when_already_downloading(gigaam_service: GigaAMService) -> None:
    """start() when already 'downloading' returns snapshot without restarting."""
    mgr = ModelPreloadManager(gigaam_service)

    mgr._cancelled.set()  # dirty state
    mgr.status = "downloading"
    mgr.progress = 0.42
    mgr.stage = "Скачивание 220M: 500 МБ / 880 МБ"

    snapshot = mgr.start()

    # Should NOT have cleared _cancelled (still set from dirty state)
    assert mgr._cancelled.is_set() is True
    assert snapshot["status"] == "downloading"
    assert snapshot["progress"] == 0.42


# ---------------------------------------------------------------------------
# 5. _persist_status() writes to downloads.json
# ---------------------------------------------------------------------------


def test_persist_status_writes_downloads_json(
    gigaam_service: GigaAMService,
    tmp_path: Path,
) -> None:
    """_persist_status() writes status data to downloads.json."""
    # We need to make config.settings point to a temp directory
    from backend.app import config

    original_path = config.settings.downloads_status_path

    # Override app_data_dir via env + reload property
    # Simpler: directly patch the path
    downloads_path = tmp_path / "downloads.json"
    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        mgr.status = "downloading"
        mgr.progress = 0.55
        mgr.stage = "Скачивание 220M: 500 МБ / 880 МБ"
        mgr.error = None

        mgr._persist_status()

        assert downloads_path.is_file()
        data = json.loads(downloads_path.read_text(encoding="utf-8"))
        assert data["status"] == "downloading"
        assert data["progress"] == 0.55
        assert "статус" not in data or "stage" in data  # stage should be present
        assert data["stage"] == "Скачивание 220M: 500 МБ / 880 МБ"
        assert data["error"] is None
        assert "timestamp" in data


def test_persist_status_records_error(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """_persist_status() writes error info to downloads.json."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        mgr.status = "failed"
        mgr.progress = 0.3
        mgr.stage = "Ошибка загрузки"
        mgr.error = "Connection refused"
        mgr.error_code = "model_download_failed"

        mgr._persist_status()

        data = json.loads(downloads_path.read_text(encoding="utf-8"))
        assert data["status"] == "failed"
        assert data["error"] == "Connection refused"
        assert data["error_code"] == "model_download_failed"


def test_persist_status_completed(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """_persist_status() writes completed status correctly."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        mgr.status = "completed"
        mgr.progress = 1.0
        mgr.stage = "220M и 600M скачаны: приложение готово к офлайн-работе."
        mgr.error = None

        mgr._persist_status()

        data = json.loads(downloads_path.read_text(encoding="utf-8"))
        assert data["status"] == "completed"
        assert data["progress"] == 1.0


# ---------------------------------------------------------------------------
# 6. _restore_status() reads downloads.json, converts "downloading" → "paused"
# ---------------------------------------------------------------------------


def test_restore_status_downloading_becomes_paused(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """When downloads.json has status='downloading', restore converts to 'paused'."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    downloads_path.parent.mkdir(parents=True, exist_ok=True)
    downloads_path.write_text(
        json.dumps({
            "status": "downloading",
            "progress": 0.45,
            "stage": "Скачивание 220M: 400 МБ / 880 МБ",
            "error": None,
            "timestamp": time.time(),
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        assert mgr.status == "paused"
        assert "Загрузка прервана" in str(mgr.stage)
        assert "Продолжить" in str(mgr.stage)


def test_restore_status_completed_is_preserved(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """When downloads.json has status='completed', restore preserves it."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    downloads_path.parent.mkdir(parents=True, exist_ok=True)
    downloads_path.write_text(
        json.dumps({
            "status": "completed",
            "progress": 1.0,
            "stage": "Модели готовы",
            "error": None,
            "timestamp": time.time(),
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        assert mgr.status == "completed"
        assert mgr.progress == 1.0
        assert mgr.stage == "Модели готовы"


def test_restore_status_failed_is_preserved(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """When downloads.json has status='failed', restore preserves it with error."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    downloads_path.parent.mkdir(parents=True, exist_ok=True)
    downloads_path.write_text(
        json.dumps({
            "status": "failed",
            "progress": 0.12,
            "stage": "Ошибка",
            "error": "Network error",
            "timestamp": time.time(),
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        assert mgr.status == "failed"
        assert mgr.error == "Network error"


def test_restore_status_cancelled_is_preserved(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """When downloads.json has status='cancelled', restore preserves it."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    downloads_path.parent.mkdir(parents=True, exist_ok=True)
    downloads_path.write_text(
        json.dumps({
            "status": "cancelled",
            "progress": 0.22,
            "stage": "Отменено",
            "error": None,
            "error_code": "cancelled",
            "timestamp": time.time(),
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        assert mgr.status == "cancelled"
        assert mgr.progress == 0.22
        assert mgr.stage == "Отменено"
        assert mgr.error_code == "cancelled"


def test_restore_status_no_file_defaults_to_idle(gigaam_service: GigaAMService, tmp_path: Path) -> None:
    """When downloads.json doesn't exist, defaults to 'idle'."""
    from backend.app import config

    downloads_path = tmp_path / "nonexistent_downloads.json"
    # Ensure file does NOT exist
    downloads_path.unlink(missing_ok=True)

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        assert mgr.status == "idle"
        assert mgr.stage == "Модели ещё не подготовлены"


# ---------------------------------------------------------------------------
# 7. Full lifecycle: start → cancel → start again → complete
# ---------------------------------------------------------------------------


def test_full_cancel_and_restart_lifecycle(
    gigaam_service: GigaAMService,
    tmp_path: Path,
) -> None:
    """A cancelled download can be restarted successfully."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        # Mock ensure_download so the background thread doesn't try real work
        with patch.object(gigaam_service, "ensure_download", return_value=None):
            mgr = ModelPreloadManager(gigaam_service)

            # Phase 1: start a download, cancel it early
            mgr.status = "downloading"
            snap1 = mgr.cancel()
            assert snap1["status"] == "cancelled"
            assert mgr._cancelled.is_set()

            # Phase 2: restart — _cancelled should be cleared
            mgr._cancelled.set()  # simulate residual
            mgr.status = "cancelled"

            snap2 = mgr.start()
            assert mgr._cancelled.is_set() is False
            assert snap2["status"] == "downloading"


# ---------------------------------------------------------------------------
# 8. config.downloads_status_path property
# ---------------------------------------------------------------------------


def test_downloads_status_path_returns_app_data_dir_downloads_json() -> None:
    """config.downloads_status_path returns app_data_dir / 'downloads.json'."""
    from backend.app.config import settings

    path = settings.downloads_status_path
    assert isinstance(path, Path)
    assert path.name == "downloads.json"
    # It should be a child of app_data_dir
    expected_parent = settings.app_data_dir
    assert path.parent == expected_parent


# ---------------------------------------------------------------------------
# 9. POST /api/models/preload/cancel endpoint exists
# ---------------------------------------------------------------------------


def test_cancel_preload_endpoint_returns_preload_response(
    gigaam_service: GigaAMService,
) -> None:
    """POST /api/models/preload/cancel when idle: returns PreloadResponse with status='idle'."""
    from backend.app.api.transcriptions import cancel_preload
    from backend.app.schemas import PreloadResponse

    mock_request = MagicMock()
    preload = ModelPreloadManager(gigaam_service)
    mock_request.app.state.preload = preload

    # When idle, cancel() keeps status='idle' — this should pass schema validation
    preload.status = "idle"
    preload.stage = "Модели ещё не подготовлены"
    preload.progress = 0.0

    response = cancel_preload(mock_request)

    assert isinstance(response, PreloadResponse)
    assert response.status == "idle"

    # Verify that cancel() correctly sets the internal state
    assert preload._cancelled.is_set()


def test_cancel_preload_endpoint_when_idle(gigaam_service: GigaAMService) -> None:
    """POST /api/models/preload/cancel when idle: sets cancelled flag but status stays idle."""
    from backend.app.api.transcriptions import cancel_preload
    from backend.app.schemas import PreloadResponse

    mock_request = MagicMock()
    preload = ModelPreloadManager(gigaam_service)
    mock_request.app.state.preload = preload

    preload.status = "idle"
    preload.stage = "Модели ещё не подготовлены"

    response = cancel_preload(mock_request)

    assert isinstance(response, PreloadResponse)
    assert response.status == "idle"


def test_cancel_preload_endpoint_when_downloading_returns_cancelled(
    gigaam_service: GigaAMService,
) -> None:
    """POST /api/models/preload/cancel when 'downloading' → returns status='cancelled'.

    This replaces the old stale test that expected pydantic.ValidationError
    before PreloadStatus enum was extended with 'cancelled' and 'paused' values.
    With the fix in place, cancel_preload() succeeds and returns a valid
    PreloadResponse with status='cancelled'.
    """
    from backend.app.api.transcriptions import cancel_preload
    from backend.app.schemas import PreloadResponse

    mock_request = MagicMock()
    preload = ModelPreloadManager(gigaam_service)
    mock_request.app.state.preload = preload

    preload.status = "downloading"
    preload.stage = "Скачивание..."
    preload.progress = 0.5

    response = cancel_preload(mock_request)

    assert isinstance(response, PreloadResponse)
    assert response.status == "cancelled"
    assert preload._cancelled.is_set()


# ---------------------------------------------------------------------------
# 10. Adversarial / edge cases
# ---------------------------------------------------------------------------


def test_cancel_twice_is_idempotent(gigaam_service: GigaAMService) -> None:
    """Calling cancel() twice when 'downloading' is idempotent."""
    mgr = ModelPreloadManager(gigaam_service)

    mgr.status = "downloading"
    mgr._cancelled.clear()

    snap1 = mgr.cancel()
    assert snap1["status"] == "cancelled"

    # Second cancel
    snap2 = mgr.cancel()
    assert snap2["status"] == "cancelled"
    # Event should still be set
    assert mgr._cancelled.is_set()


def test_persist_status_with_unwriteable_path_does_not_crash(
    gigaam_service: GigaAMService,
    tmp_path: Path,
) -> None:
    """_persist_status() handles write failures gracefully (best-effort)."""
    from backend.app import config

    # Point downloads.json to a path that can't be written to
    unwriteable = tmp_path / "readonly_dir" / "downloads.json"
    unwriteable.parent.mkdir(parents=True, exist_ok=True)
    # Create as directory to make writing impossible
    # Actually, let's make it a read-only directory
    os_readonly_dir = tmp_path / "readonly_dir2"
    os_readonly_dir.mkdir(parents=True, exist_ok=True)
    import os
    os.chmod(str(os_readonly_dir), 0o444)  # read-only
    bad_path = os_readonly_dir / "downloads.json"

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: bad_path)):
        mgr = ModelPreloadManager(gigaam_service)

        mgr.status = "downloading"
        mgr.progress = 0.5
        mgr.stage = "test"
        mgr.error = None

        # Should not raise
        mgr._persist_status()

    # Cleanup
    os.chmod(str(os_readonly_dir), 0o755)


def test_restore_status_corrupted_json_does_not_crash(
    gigaam_service: GigaAMService,
    tmp_path: Path,
) -> None:
    """_restore_status() handles corrupted JSON gracefully."""
    from backend.app import config

    downloads_path = tmp_path / "downloads.json"
    downloads_path.parent.mkdir(parents=True, exist_ok=True)
    downloads_path.write_text("not valid json {{{", encoding="utf-8")

    with patch.object(config.settings.__class__, "downloads_status_path",
                       new_callable=lambda: property(lambda self: downloads_path)):
        mgr = ModelPreloadManager(gigaam_service)

        # Should default to idle without crashing
        assert mgr.status == "idle"


def test_snapshot_includes_all_fields(gigaam_service: GigaAMService) -> None:
    """snapshot() returns all expected fields with correct types."""
    mgr = ModelPreloadManager(gigaam_service)

    mgr.status = "downloading"
    mgr.progress = 0.42
    mgr.stage = "Скачивание 220M: 500 МБ / 880 МБ"
    mgr.error = None
    mgr.error_code = None  # reset in case _restore_status loaded stale value

    snap = mgr.snapshot()

    assert "status" in snap
    assert "progress" in snap
    assert "stage" in snap
    assert "error" in snap
    assert "error_code" in snap
    assert snap["status"] == "downloading"
    assert snap["progress"] == 0.42
    assert snap["error"] is None
    assert snap["error_code"] is None
