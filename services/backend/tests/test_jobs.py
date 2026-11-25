import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import current_user
from app.db import get_pool
from app.ratelimit import RateLimiter, submit_limiter
from app.worker import celery_app
from tests.fakes import PROJECT_ID, USER, FakePool

LATEST = f"/projects/{PROJECT_ID}/jobs/latest"
RETRY = f"/projects/{PROJECT_ID}/jobs/ingest/retry"
NOW = datetime(2026, 1, 1, tzinfo=UTC)
JOB_ID = uuid.uuid4()
FAILED = {
    "id": JOB_ID, "project_id": PROJECT_ID, "status": "failed", "error_code": "storage_unavailable",
    "attempts": 4, "created_at": NOW, "started_at": NOW, "finished_at": NOW, "duration_ms": 1200,
}  # fmt: skip
NEW_JOB = {"id": uuid.uuid4(), "project_id": PROJECT_ID, "status": "queued", "created_at": NOW}
FILE = {"id": uuid.uuid4(), "kind": "photo", "status": "invalid", "error_code": "corrupt_file",
        "width": None, "height": None}  # fmt: skip


class Env:
    def __init__(self) -> None:
        self.pool = FakePool()
        self.sent: list[tuple[str, list[str]]] = []
        self.send_error: Exception | None = None
        self.pool.on("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
        self.pool.on("order by created_at desc limit 1", [FAILED])
        self.pool.on("from project_files", [FILE])
        self.pool.on("insert into jobs", [NEW_JOB])

    def latest(self, **changes: Any) -> None:
        self.pool.answers = [a for a in self.pool.answers if "limit 1" not in a[0]]
        self.pool.on("order by created_at desc limit 1", [{**FAILED, **changes}] if changes != {"none": 1} else [])


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch, fake_env: None) -> Iterator[Env]:
    e = Env()

    def send_task(name: str, args: list[str]) -> None:
        if e.send_error:
            raise e.send_error
        e.sent.append((name, args))

    monkeypatch.setattr(celery_app, "send_task", send_task)
    limiter = RateLimiter(100, 60)
    app.dependency_overrides[submit_limiter] = lambda: limiter
    app.dependency_overrides[get_pool] = lambda: e.pool
    app.dependency_overrides[current_user] = lambda: USER
    yield e
    app.dependency_overrides.clear()


@pytest.fixture
def client(env: Env) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def test_latest_job_comes_with_the_state_of_each_file(client: TestClient, env: Env) -> None:
    body = client.get(LATEST).json()

    assert body["id"] == str(JOB_ID) and body["status"] == "failed"
    assert body["error_code"] == "storage_unavailable" and body["duration_ms"] == 1200
    assert body["files"] == [{**FILE, "id": str(FILE["id"])}]
    assert env.pool.ran("order by created_at desc limit 1") == [(PROJECT_ID, USER.id)]
    assert env.pool.ran("from project_files") == [(PROJECT_ID, USER.id)]


def test_no_job_or_a_foreign_project_is_a_404(client: TestClient, env: Env) -> None:
    env.pool.answers = [a for a in env.pool.answers if "limit 1" not in a[0]]

    assert client.get(LATEST).status_code == 404
    assert client.get("/projects/not-a-uuid/jobs/latest").status_code == 404


def test_retry_creates_and_enqueues_a_new_job_after_a_failure(client: TestClient, env: Env) -> None:
    response = client.post(RETRY)

    assert response.status_code == 202 and response.json()["id"] == str(NEW_JOB["id"])
    assert env.sent == [("ingest", [str(NEW_JOB["id"])])]
    assert env.pool.ran("insert into jobs") == [(PROJECT_ID, USER.id)]


@pytest.mark.parametrize("status", ["queued", "running", "done"])
def test_retry_is_refused_unless_the_last_job_failed(
    client: TestClient, env: Env, status: str
) -> None:
    env.latest(status=status)

    response = client.post(RETRY)

    assert response.status_code == 409 and response.json()["error"]["code"] == "job_not_failed"
    assert env.sent == [] and env.pool.ran("insert into jobs") == []


def test_retry_is_refused_without_a_job_or_when_the_project_is_not_ingesting(
    client: TestClient, env: Env
) -> None:
    env.pool.answers[0] = ("for update", [{"id": PROJECT_ID, "status": "draft"}])
    assert client.post(RETRY).status_code == 409

    env.pool.answers = [a for a in env.pool.answers if "limit 1" not in a[0]]
    env.pool.answers[0] = ("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
    assert client.post(RETRY).status_code == 409


def test_retry_on_a_foreign_project_is_a_404(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()

    assert client.post(RETRY).status_code == 404 and env.sent == []


def test_a_refusing_broker_fails_the_new_job_and_keeps_the_project(
    client: TestClient, env: Env
) -> None:
    env.send_error = ConnectionError("redis down")

    response = client.post(RETRY)

    assert response.status_code == 503 and response.json()["error"]["code"] == "enqueue_failed"
    assert env.pool.ran("enqueue_failed") == [(NEW_JOB["id"], USER.id)]
    assert env.pool.ran("set status = 'draft'") == []


def test_retry_is_rate_limited(client: TestClient, env: Env) -> None:
    app.dependency_overrides[submit_limiter] = lambda: RateLimiter(1, 60)

    first, second = client.post(RETRY), client.post(RETRY)

    assert (first.status_code, second.status_code) == (202, 429)
