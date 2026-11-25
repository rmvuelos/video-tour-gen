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


@pytest.mark.usefixtures("fake_env")
def test_secrets_are_masked_in_repr() -> None:
    settings = Settings(_env_file=None)

    assert "test-secret" not in repr(settings)
    assert "test-pass" not in repr(settings)
    assert settings.supabase_secret_key.get_secret_value() == "test-secret"


@pytest.mark.usefixtures("fake_env")
def test_jwt_issuer_is_kept_verbatim() -> None:
    assert Settings(_env_file=None).supabase_jwt_issuer == "http://supabase.test/auth/v1"


def test_missing_jwt_issuer_fails_when_built(
    monkeypatch: pytest.MonkeyPatch, fake_env: None
) -> None:
    monkeypatch.delenv("SUPABASE_JWT_ISSUER")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize("name", ["SUPABASE_JWKS_URL", "SUPABASE_JWT_ISSUER"])
@pytest.mark.parametrize("value", ["", "not-a-url", "ftp://supabase.test/x", "file:///etc/passwd"])
def test_auth_urls_must_be_http(
    monkeypatch: pytest.MonkeyPatch, fake_env: None, name: str, value: str
) -> None:
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
