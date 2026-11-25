import uuid
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import current_user
from app.db import get_pool
from app.errors import ApiError
from app.ratelimit import RateLimiter, files_limiter
from app.storage import get_storage
from tests.fakes import PROJECT_ID, USER, FakePool, FakeStorage

LIMIT = 3
BODY = {"files": [{"kind": "photo", "filename": "a.jpg", "size": 10, "mime": "image/jpeg"}]}


def test_blocks_after_the_limit_and_frees_after_the_window() -> None:
    now = [0.0]
    limiter = RateLimiter(limit=2, window_seconds=60, clock=lambda: now[0])

    limiter.hit("ana", "files")
    limiter.hit("ana", "files")
    with pytest.raises(ApiError) as caught:
        limiter.hit("ana", "files")
    now[0] = 61.0
    limiter.hit("ana", "files")

    assert caught.value.status_code == 429
    assert caught.value.code == "rate_limited"
    assert caught.value.headers == {"Retry-After": "60"}


def test_users_and_scopes_do_not_share_a_budget() -> None:
    limiter = RateLimiter(limit=1, window_seconds=60, clock=lambda: 0.0)

    limiter.hit("ana", "files")
    limiter.hit("ben", "files")
    limiter.hit("ana", "submit")


@pytest.fixture
def now() -> list[float]:
    return [0.0]


@pytest.fixture
def client(now: list[float], fake_env: None) -> Iterator[TestClient]:
    pool = FakePool()
    pool.on("for update", [{"id": PROJECT_ID, "status": "draft"}])
    limiter = RateLimiter(LIMIT, 60, clock=lambda: now[0])  # a fresh budget per test
    app.dependency_overrides[files_limiter] = lambda: limiter
    app.dependency_overrides[get_pool] = lambda: pool
    app.dependency_overrides[get_storage] = lambda: FakeStorage()
    app.dependency_overrides[current_user] = lambda: USER
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def test_the_request_after_the_limit_is_429_with_retry_after(
    client: TestClient, now: list[float]
) -> None:
    url = f"/projects/{PROJECT_ID}/files"

    statuses = [client.post(url, json=BODY).status_code for _ in range(LIMIT)]
    blocked = client.post(url, json=BODY)
    now[0] = 61.0
    after_window = client.post(url, json=BODY)

    assert statuses == [201] * LIMIT
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert blocked.headers["retry-after"] == "60"
    assert after_window.status_code == 201


def test_deleting_files_spends_the_same_budget(client: TestClient) -> None:
    url = f"/projects/{PROJECT_ID}/files/{uuid.uuid4()}"

    statuses = [client.delete(url).status_code for _ in range(LIMIT + 1)]

    assert statuses == [404] * LIMIT + [429]


def test_retry_after_is_the_time_left_until_the_oldest_hit_expires() -> None:
    now = [0.0]
    limiter = RateLimiter(limit=1, window_seconds=60, clock=lambda: now[0])
    limiter.hit("ana", "files")
    now[0] = 20.0

    with pytest.raises(ApiError) as caught:
        limiter.hit("ana", "files")

    assert caught.value.headers == {"Retry-After": "40"}


def test_idle_users_leave_no_counters_behind() -> None:
    now = [0.0]
    limiter = RateLimiter(limit=2, window_seconds=60, clock=lambda: now[0])
    for user in ("ana", "ben", "eva"):
        limiter.hit(user, "files")
    now[0] = 61.0

    limiter.hit("ana", "files")

    assert len(limiter) == 1


def test_concurrent_requests_never_pass_the_limit() -> None:
    limiter = RateLimiter(limit=10, window_seconds=60, clock=lambda: 0.0)
    outcomes: list[bool] = []

    def attempt() -> None:
        try:
            limiter.hit("ana", "files")
            outcomes.append(True)
        except ApiError:
            outcomes.append(False)

    with ThreadPoolExecutor(max_workers=16) as pool:
        for _ in range(200):
            pool.submit(attempt)

    assert outcomes.count(True) == 10
