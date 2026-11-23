from collections.abc import Iterator

import pytest

from app.settings import get_settings

FAKE_ENV = {
    "SUPABASE_URL": "http://supabase.test",
    "SUPABASE_JWKS_URL": "http://supabase.test/jwks",
    "SUPABASE_SECRET_KEY": "test-secret",
    "REDIS_URL": "redis://redis.test:6379/0",
    "DATABASE_URL": "postgresql://user:test-pass@db.test/db",
}


@pytest.fixture
def fake_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key, value in FAKE_ENV.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
