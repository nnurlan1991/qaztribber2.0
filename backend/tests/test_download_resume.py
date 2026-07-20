from __future__ import annotations

import socket
import sys
import types
import urllib.request
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.app.services.gigaam import GigaAMService, MODELS


# ---------------------------------------------------------------------------
# Fake gigaam module helper
# ---------------------------------------------------------------------------

def _fake_gigaam_module(model_name: str, expected_hash: str) -> types.ModuleType:
    """Create a minimal fake gigaam module with _MODEL_HASHES."""
    module = types.ModuleType("gigaam")
    module._MODEL_HASHES = {model_name: expected_hash}
    return module


# ---------------------------------------------------------------------------
# Fake response helper
# ---------------------------------------------------------------------------

class FakeResponse:
    def __init__(
        self,
        data: bytes | str,
        status_code: int = 200,
        headers: dict[str, str] | None = None,
        content_range: str | None = None,
    ) -> None:
        self._data = data if isinstance(data, bytes) else data.encode()
        self._pos = 0
        self._status_code = status_code
        self._headers = headers or {}
        if content_range:
            self._headers["Content-Range"] = content_range
        self._headers["Content-Length"] = str(len(self._data))

    def getcode(self) -> int:
        return self._status_code

    @property
    def status(self) -> int:
        return self._status_code

    @property
    def headers(self) -> dict[str, str]:
        return self._headers

    def read(self, size: int = -1) -> bytes:
        if size == -1 or size > len(self._data) - self._pos:
            result = self._data[self._pos:]
            self._pos = len(self._data)
        else:
            result = self._data[self._pos:self._pos + size]
            self._pos += size
        return result

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        pass


# ---------------------------------------------------------------------------
# Test 1: fresh download — no .ckpt.part exists
# ---------------------------------------------------------------------------

def test_download_fresh_start(tmp_path: Path) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    service = GigaAMService(models_dir)

    model_name = MODELS["220m"].gigaam_name
    target = models_dir / f"{model_name}.ckpt"

    fake_data = b"fake-model-content" * 100  # ~1.8 KB
    expected_hash = service._checksum(
        _write_bytes(target.with_suffix(".ckpt.part"), fake_data)
    )
    # Clean up — this is a fresh start test, no partial should exist
    target.with_suffix(".ckpt.part").unlink(missing_ok=True)

    fake_gigaam = _fake_gigaam_module(model_name, expected_hash)
    report_messages: list[tuple[str, float]] = []

    with patch.object(service, "_checksum", return_value=expected_hash), \
         patch.object(urllib.request, "urlopen") as mock_urlopen, \
         patch.dict(sys.modules, {"gigaam": fake_gigaam}):
        mock_urlopen.return_value = FakeResponse(data=fake_data, status_code=200)

        service.ensure_download("220m", lambda s, f: report_messages.append((s, f)))

    # Verify file was created
    assert target.is_file()
    assert target.read_bytes() == fake_data

    # Verify no .part file left behind
    assert not target.with_suffix(".ckpt.part").exists()

    # Verify messages include download and completion
    stages = [m[0] for m in report_messages]
    assert any("Подключение к серверу" in s for s in stages)
    assert any("сохранена на диске" in s for s in stages)


# ---------------------------------------------------------------------------
# Test 2: resume from partial — existing .ckpt.part, server supports Range
# ---------------------------------------------------------------------------

def test_download_resume_from_partial(tmp_path: Path) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    service = GigaAMService(models_dir)

    model_name = MODELS["220m"].gigaam_name
    target = models_dir / f"{model_name}.ckpt"
    part = target.with_suffix(".ckpt.part")

    first_half = b"FIRST-HALF-DATA" * 100
    second_half = b"SECOND-HALF-DATA" * 100
    full_data = first_half + second_half

    # Write the partial file with first half
    part.write_bytes(first_half)
    existing_size = len(first_half)

    expected_hash = service._checksum(
        _write_bytes(Path(str(part) + ".verify"), full_data)
    )

    fake_gigaam = _fake_gigaam_module(model_name, expected_hash)
    report_messages: list[tuple[str, float]] = []

    with patch.object(service, "_checksum", return_value=expected_hash), \
         patch.object(urllib.request, "urlopen") as mock_urlopen, \
         patch.dict(sys.modules, {"gigaam": fake_gigaam}):
        # Server responds with 206 and only the second half
        content_range = f"bytes {existing_size}-{len(full_data) - 1}/{len(full_data)}"
        mock_urlopen.return_value = FakeResponse(
            data=second_half,
            status_code=206,
            content_range=content_range,
        )

        service.ensure_download("220m", lambda s, f: report_messages.append((s, f)))

    # Verify full file was created
    assert target.is_file()
    assert target.read_bytes() == full_data

    # Verify no .part file left behind
    assert not part.exists()

    # Verify resume message was reported
    stages = [m[0] for m in report_messages]
    assert any("Возобновление загрузки" in s for s in stages)


# ---------------------------------------------------------------------------
# Test 3: server doesn't support Range → starts fresh
# ---------------------------------------------------------------------------

def test_download_server_no_range_support(tmp_path: Path) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    service = GigaAMService(models_dir)

    model_name = MODELS["220m"].gigaam_name
    target = models_dir / f"{model_name}.ckpt"
    part = target.with_suffix(".ckpt.part")

    fake_data = b"complete-model-data" * 100
    stale_partial = b"stale-data" * 10

    # Write a stale partial file — server won't honor Range
    part.write_bytes(stale_partial)

    expected_hash = service._checksum(
        _write_bytes(part.with_suffix(".verify"), fake_data)
    )

    fake_gigaam = _fake_gigaam_module(model_name, expected_hash)
    report_messages: list[tuple[str, float]] = []

    with patch.object(service, "_checksum", return_value=expected_hash), \
         patch.object(urllib.request, "urlopen") as mock_urlopen, \
         patch.dict(sys.modules, {"gigaam": fake_gigaam}):
        # Server returns 200 (full file) despite Range header
        mock_urlopen.return_value = FakeResponse(data=fake_data, status_code=200)

        service.ensure_download("220m", lambda s, f: report_messages.append((s, f)))

    # Verify full file was created with fresh data (not appended)
    assert target.is_file()
    assert target.read_bytes() == fake_data

    # Verify no .part file left behind
    assert not part.exists()

    # Verify fallback message was reported
    stages = [m[0] for m in report_messages]
    assert any("Сервер не поддерживает возобновление" in s for s in stages)


# ---------------------------------------------------------------------------
# Test 4: timeout preserves .ckpt.part
# ---------------------------------------------------------------------------

def test_download_timeout_preserves_partial(tmp_path: Path) -> None:
    models_dir = tmp_path / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    service = GigaAMService(models_dir)

    model_name = MODELS["220m"].gigaam_name
    target = models_dir / f"{model_name}.ckpt"
    part = target.with_suffix(".ckpt.part")

    partial_data = b"saved-progress" * 100

    # Write some partial data first
    part.write_bytes(partial_data)

    fake_gigaam = _fake_gigaam_module(model_name, "fake-hash")

    with patch.object(urllib.request, "urlopen") as mock_urlopen, \
         patch.dict(sys.modules, {"gigaam": fake_gigaam}):

        # Simulate timeout during read
        def read_then_timeout(*args: object, **kwargs: object) -> bytes:
            raise socket.timeout("timed out")

        mock_response = FakeResponse(data=b"more-data" * 100, status_code=206,
                                      content_range="bytes 1300-2600/2600")
        mock_response.read = read_then_timeout  # type: ignore[method-assign]
        mock_urlopen.return_value = mock_response

        with pytest.raises(RuntimeError, match="Таймаут загрузки"):
            service.ensure_download("220m", lambda s, f: None)

    # Verify .ckpt.part still exists (preserved on error)
    assert part.exists()
    # Verify the original partial data is still there
    assert part.read_bytes() == partial_data

    # Verify target .ckpt was NOT created
    assert not target.exists()


# ---------------------------------------------------------------------------
# Test 5: checksum failure deletes .ckpt.part
# ---------------------------------------------------------------------------

def test_checksum_failure_deletes_partial(tmp_path: Path) -> None:
    models_dir = tmp_path / "models"
    service = GigaAMService(models_dir)

    model_name = MODELS["220m"].gigaam_name
    target = models_dir / f"{model_name}.ckpt"
    part = target.with_suffix(".ckpt.part")

    corrupted_data = b"corrupted-payload" * 100

    fake_gigaam = _fake_gigaam_module(model_name, "correct-hash")

    # checksum won't match
    with patch.object(service, "_checksum", return_value="wrong-hash"), \
         patch.object(urllib.request, "urlopen") as mock_urlopen, \
         patch.dict(sys.modules, {"gigaam": fake_gigaam}):
        mock_urlopen.return_value = FakeResponse(data=corrupted_data, status_code=200)

        with pytest.raises(RuntimeError, match="контрольная сумма не совпала"):
            service.ensure_download("220m", lambda s, f: None)

    # Verify .ckpt.part was deleted (corrupted)
    assert not part.exists()
    # Verify target .ckpt was NOT created
    assert not target.exists()


# ---------------------------------------------------------------------------
# Test 6: already cached — no download attempted
# ---------------------------------------------------------------------------

def test_download_already_cached(tmp_path: Path) -> None:
    models_dir = tmp_path / "models"
    service = GigaAMService(models_dir)

    model_name = MODELS["220m"].gigaam_name
    target = models_dir / f"{model_name}.ckpt"
    models_dir.mkdir(parents=True)

    valid_data = b"valid-cached-model" * 100
    target.write_bytes(valid_data)
    expected_hash = service._checksum(target)

    fake_gigaam = _fake_gigaam_module(model_name, expected_hash)
    report_messages: list[tuple[str, float]] = []

    with patch.object(urllib.request, "urlopen") as mock_urlopen, \
         patch.dict(sys.modules, {"gigaam": fake_gigaam}):

        service.ensure_download("220m", lambda s, f: report_messages.append((s, f)))

    # Verify urlopen was NOT called (cache hit)
    mock_urlopen.assert_not_called()

    # Verify completion message
    stages = [m[0] for m in report_messages]
    assert any("уже сохранена на диске" in s for s in stages)

    # Verify file unchanged
    assert target.read_bytes() == valid_data


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _write_bytes(path: Path, data: bytes) -> Path:
    """Write bytes to path and return the path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path
