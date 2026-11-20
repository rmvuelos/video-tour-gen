from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.startup import validate_startup


@pytest.mark.usefixtures("fake_env")
def test_validate_startup_passes_with_valid_setup() -> None:
    validate_startup()


@pytest.mark.usefixtures("fake_env")
def test_validate_startup_fails_when_limits_file_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("INPUT_LIMITS_PATH", str(tmp_path / "missing.json"))

    with pytest.raises(FileNotFoundError):
        validate_startup()


@pytest.mark.usefixtures("fake_env")
def test_validate_startup_fails_when_limits_file_is_invalid(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text("{}")
    monkeypatch.setenv("INPUT_LIMITS_PATH", str(bad))

    with pytest.raises(ValueError):
        validate_startup()


def test_api_refuses_to_start_without_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.chdir("/")

    with pytest.raises(ValueError), TestClient(app):
        pass
