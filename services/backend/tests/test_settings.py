import pytest
from pydantic import ValidationError

from app.settings import Settings


def test_import_does_not_require_env() -> None:
    # Importing app.settings must never validate the environment.
    import app.settings  # noqa: F401


def test_missing_required_values_fail_when_built(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
