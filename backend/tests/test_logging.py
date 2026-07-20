from __future__ import annotations

import ast
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def app_with_logging(tmp_path: Path):
    """Creates a FastAPI app with init_logging pointed at tmp_path."""
    from backend.app.config import settings
    from backend.app.main import app as fastapi_app
    from backend.app.logging_config import init_logging

    # Point data dir at tmp_path so we don't touch the real filesystem
    data_dir = tmp_path / "QazTriber"
    data_dir.mkdir(parents=True, exist_ok=True)
    init_logging(data_dir)

    # Ensure directories exist (just logs_dir is enough for tests)
    (data_dir / "logs").mkdir(parents=True, exist_ok=True)
    (data_dir / "models").mkdir(parents=True, exist_ok=True)
    (data_dir / "jobs").mkdir(parents=True, exist_ok=True)

    # Override settings' data dir for this test session so /api/logs
    # reads from tmp_path instead of the real ~/Library/...
    # We monkey-patch the property.
    original_app_data_dir = settings.__class__.app_data_dir
    original_logs_dir = settings.__class__.logs_dir

    def fake_app_data_dir(self) -> Path:
        return data_dir

    def fake_logs_dir(self) -> Path:
        return data_dir / "logs"

    settings.__class__.app_data_dir = property(fake_app_data_dir)
    settings.__class__.logs_dir = property(fake_logs_dir)

    # We need a minimal lifespan mock — init_logging was already called above.
    # Override the lifespan since it references JobManager/GigaAM.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def fake_lifespan(app):
        yield

    fastapi_app.router.lifespan_context = fake_lifespan

    client = TestClient(fastapi_app)

    yield client, data_dir

    # Restore original properties
    settings.__class__.app_data_dir = original_app_data_dir
    settings.__class__.logs_dir = original_logs_dir


# ---------------------------------------------------------------------------
# Test 1: init_logging creates a log file
# ---------------------------------------------------------------------------

def test_init_logging_creates_log_file(tmp_path: Path) -> None:
    from backend.app.logging_config import init_logging

    data_dir = tmp_path / "appdata"
    init_logging(data_dir)

    log_file = data_dir / "logs" / "sidecar.log"
    assert log_file.is_file(), f"Expected {log_file} to exist after init_logging()"


# ---------------------------------------------------------------------------
# Test 2: log rotation at 5 MB
# ---------------------------------------------------------------------------

def test_log_rotation(tmp_path: Path) -> None:
    from backend.app.logging_config import init_logging

    import logging

    data_dir = tmp_path / "appdata"
    init_logging(data_dir)

    logger = logging.getLogger("rotation_test")

    # Write enough messages to exceed 5 MB
    # Each log line ≈ 100 bytes → 50 000 lines ≈ 5 MB → write 2× for safety
    message = "X" * 70  # ≈100 bytes per line with timestamp/level prefix
    for _ in range(55_000):
        logger.info(message)

    # Allow handlers to flush
    logging.shutdown()

    base = data_dir / "logs" / "sidecar.log"
    assert base.is_file()
    size = base.stat().st_size
    assert size > 0

    # Check that at least one backup was created (the main file rotated)
    backup_files = sorted(data_dir.glob("logs/sidecar.log.*"))
    assert len(backup_files) >= 1, f"Expected at least one rotation backup, found {len(backup_files)}"


# ---------------------------------------------------------------------------
# Test 3: /api/logs endpoint structure
# ---------------------------------------------------------------------------

def test_api_logs_endpoint(app_with_logging) -> None:
    client, data_dir = app_with_logging

    # Write some fake log lines with known levels
    log_path = data_dir / "logs" / "sidecar.log"
    lines = [
        "2025-01-01T12:00:00 [INFO] test.module:42 — info message",
        "2025-01-01T12:00:01 [DEBUG] test.module:43 — debug message",
        "2025-01-01T12:00:02 [WARNING] test.module:44 — warning message",
        "2025-01-01T12:00:03 [ERROR] test.module:45 — error message",
        "2025-01-01T12:00:04 [INFO] test.module:46 — another info",
    ]
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    resp = client.get("/api/logs", params={"tail": 10, "level": "INFO"})
    assert resp.status_code == 200

    data = resp.json()
    assert isinstance(data["lines"], list)
    assert data["total_in_file"] == 5
    assert data["returned"] >= 0

    # With level=INFO we should see INFO, WARNING, ERROR but not DEBUG
    returned_lines: list[str] = data["lines"]
    for line in returned_lines:
        assert "[DEBUG]" not in line, f"DEBUG line leaked into INFO filter: {line}"


# ---------------------------------------------------------------------------
# Test 4: /api/logs with missing file
# ---------------------------------------------------------------------------

def test_api_logs_missing_file(app_with_logging) -> None:
    client, data_dir = app_with_logging

    # Delete the log file if it exists
    log_path = data_dir / "logs" / "sidecar.log"
    log_path.unlink(missing_ok=True)

    resp = client.get("/api/logs", params={"tail": 100, "level": "INFO"})
    assert resp.status_code == 200

    data = resp.json()
    assert data["lines"] == []
    assert data["total_in_file"] == 0
    assert data["returned"] == 0


# ---------------------------------------------------------------------------
# Test 5: no print() calls in backend/app/
# ---------------------------------------------------------------------------

def test_no_print_calls_remain() -> None:
    """Scan all Python files in backend/app/ — no bare print() should exist."""
    project_root = Path(__file__).resolve().parents[2]  # QazTriber-main/
    app_dir = project_root / "backend" / "app"

    violations: list[str] = []

    for py_file in sorted(app_dir.rglob("*.py")):
        source = py_file.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError:
            continue  # skip unparseable files

        class PrintVisitor(ast.NodeVisitor):
            def visit_Call(self, node: ast.Call) -> None:
                if isinstance(node.func, ast.Name) and node.func.id == "print":
                    violations.append(f"{py_file.relative_to(project_root)}:{node.lineno}")
                self.generic_visit(node)

        PrintVisitor().visit(tree)

    if violations:
        pytest.fail(f"print() calls found in backend/app/: {', '.join(violations)}")
