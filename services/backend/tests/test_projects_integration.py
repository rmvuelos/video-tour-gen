"""Against the local Supabase stack, with real Auth tokens (see scripts/run-integration.mjs)."""

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

REQUIRED_ENV = [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_JWKS_URL",
    "SUPABASE_JWT_ISSUER",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
]
pytestmark = pytest.mark.integration
LOCAL_HOSTS = {"host.docker.internal", "127.0.0.1", "localhost"}
TIMEOUT = 10
PASSWORD = "test-password-123"


@dataclass(frozen=True)
class Account:
    id: str
    headers: dict[str, str]


@pytest.fixture(scope="module", autouse=True)
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
def client() -> Iterator[TestClient]:
    get_settings.cache_clear()
    auth.get_jwk_client.cache_clear()
    with TestClient(app) as test_client:  # runs the lifespan: opens the pool
        yield test_client
    get_settings.cache_clear()


@pytest.fixture(scope="module")
def make_user() -> Iterator[Callable[[], Account]]:
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
    for user_id in created:  # projects go with the user (on delete cascade)
        deleted = httpx.delete(f"{auth_url}/admin/users/{user_id}", headers=secret, timeout=TIMEOUT)
        deleted.raise_for_status()


def test_real_supabase_token_passes_auth_and_creates_a_project(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana = make_user()

    me = client.get("/me", headers=ana.headers)
    created = client.post("/projects", json={"name": " Casa "}, headers=ana.headers)

    assert me.status_code == 200
    assert me.json()["id"] == ana.id
    assert created.status_code == 201
    assert created.json()["name"] == "Casa"
    assert created.json()["status"] == "draft"


def test_list_is_newest_first_and_paginated(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana = make_user()
    for name in ("one", "two", "three"):
        client.post("/projects", json={"name": name}, headers=ana.headers).raise_for_status()

    first = client.get("/projects?limit=2", headers=ana.headers).json()
    rest = client.get("/projects?limit=2&offset=2", headers=ana.headers).json()

    assert [p["name"] for p in first["items"]] == ["three", "two"]
    assert [p["name"] for p in rest["items"]] == ["one"]
    assert (rest["limit"], rest["offset"]) == (2, 2)


def test_user_cannot_see_or_list_another_users_project(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana, ben = make_user(), make_user()
    project = client.post("/projects", json={"name": "Ana"}, headers=ana.headers).json()

    foreign = client.get(f"/projects/{project['id']}", headers=ben.headers)
    unknown = client.get(f"/projects/{uuid.uuid4()}", headers=ben.headers)

    assert foreign.status_code == 404
    assert foreign.json() == unknown.json()
    assert client.get("/projects", headers=ben.headers).json()["items"] == []
    assert client.get(f"/projects/{project['id']}", headers=ana.headers).status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "body", "status"),
    [
        ("post", "/projects", {"name": "   "}, 422),
        ("post", "/projects", {"name": "x" * 121}, 422),
        ("get", "/projects/not-a-uuid", None, 404),
    ],
)
def test_invalid_input_is_rejected(
    client: TestClient,
    make_user: Callable[[], Account],
    method: str,
    path: str,
    body: dict[str, str] | None,
    status: int,
) -> None:
    response = client.request(method, path, json=body, headers=make_user().headers)

    assert response.status_code == status
