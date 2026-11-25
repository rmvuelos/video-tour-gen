import os
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

import app.auth as auth
from app.api import app
from app.settings import get_settings

FAKE_ENV = {
    "SUPABASE_URL": "http://supabase.test",
    "SUPABASE_JWKS_URL": "http://supabase.test/jwks",
    "SUPABASE_JWT_ISSUER": "http://supabase.test/auth/v1",
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


# Integration fixtures: local Supabase only (see scripts/run-integration.mjs).
REQUIRED_ENV = [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_JWKS_URL",
    "SUPABASE_JWT_ISSUER",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
]
LOCAL_HOSTS = {"host.docker.internal", "127.0.0.1", "localhost"}
TIMEOUT = 10
PASSWORD = "test-password-123"


@dataclass(frozen=True)
class Account:
    id: str
    headers: dict[str, str]


@pytest.fixture(scope="module")
def local_stack_only() -> None:
    """Never write to a real environment: skip without the env (fail in CI), exit if not local."""
    missing = [name for name in REQUIRED_ENV if name not in os.environ]
    if missing:
        message = f"needs the local Supabase, missing: {', '.join(missing)}"
        if os.environ.get("CI"):
            pytest.fail(message, pytrace=False)  # a silent skip would hide a broken CI
        pytest.skip(message)
    for name in ("SUPABASE_URL", "DATABASE_URL"):
        host = urlparse(os.environ[name]).hostname
        if host not in LOCAL_HOSTS:
            pytest.exit(f"refusing to run: {name} points to {host}, not a local stack", 2)


@pytest.fixture(scope="module")
def client(local_stack_only: None) -> Iterator[TestClient]:
    get_settings.cache_clear()
    auth.get_jwk_client.cache_clear()
    with TestClient(app) as test_client:  # runs the lifespan: opens the pool
        yield test_client
    get_settings.cache_clear()


def _purge_objects(user_id: str) -> None:
    """Delete what a test user left in Storage: objects live at {user}/{project}/{file}."""
    base = os.environ["SUPABASE_URL"] + "/storage/v1"
    secret = {"apikey": os.environ["SUPABASE_SECRET_KEY"]}

    def names(prefix: str) -> list[str]:
        body = {"prefix": prefix, "limit": 1000}
        listed = httpx.post(
            f"{base}/object/list/originals", headers=secret, json=body, timeout=TIMEOUT
        )
        listed.raise_for_status()
        return [item["name"] for item in listed.json()]

    for project in names(user_id):
        paths = [f"{user_id}/{project}/{name}" for name in names(f"{user_id}/{project}")]
        if paths:
            body = {"prefixes": paths}
            httpx.request(
                "DELETE", f"{base}/object/originals", headers=secret, json=body, timeout=TIMEOUT
            )


@pytest.fixture(scope="module")
def make_user(local_stack_only: None) -> Iterator[Callable[[], Account]]:
    """Creates confirmed users through the Auth admin API and logs them in with a password."""
    auth_url = os.environ["SUPABASE_URL"] + "/auth/v1"
    secret = {"apikey": os.environ["SUPABASE_SECRET_KEY"]}
    created: list[str] = []

    def make() -> Account:
        email = f"{uuid.uuid4().hex}@example.test"
        body = {"email": email, "password": PASSWORD, "email_confirm": True}
        user = httpx.post(f"{auth_url}/admin/users", headers=secret, json=body, timeout=TIMEOUT)
        user.raise_for_status()
        created.append(user.json()["id"])
        login = httpx.post(
            f"{auth_url}/token?grant_type=password",
            headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"]},
            json={"email": email, "password": PASSWORD},
            timeout=TIMEOUT,
        )
        login.raise_for_status()
        return Account(created[-1], {"Authorization": f"Bearer {login.json()['access_token']}"})

    yield make
    for user_id in created:  # projects go with the user (on delete cascade); Storage does not
        _purge_objects(user_id)
        deleted = httpx.delete(f"{auth_url}/admin/users/{user_id}", headers=secret, timeout=TIMEOUT)
        deleted.raise_for_status()
