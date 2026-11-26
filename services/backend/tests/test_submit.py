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
from app.storage import get_storage
from app.submit import configure_publisher
from app.worker import celery_app
from tests.fakes import PROJECT_ID, USER, FakePool, FakeStorage

URL = f"/projects/{PROJECT_ID}/submit"
JOB = {
    "id": uuid.uuid4(),
    "project_id": PROJECT_ID,
    "status": "queued",
    "created_at": datetime(2026, 1, 1, tzinfo=UTC),
}


def file_row(kind: str, size: int = 100, status: str = "pending") -> dict[str, Any]:
    fid = uuid.uuid4()
    return {
        "id": fid,
        "kind": kind,
        "size_bytes": size,
        "original_path": f"{USER.id}/{PROJECT_ID}/{fid}",
        "original_filename": f"{kind}-{fid.hex[:6]}.jpg",
        "status": status,
    }


class Env:
    def __init__(self) -> None:
        self.pool = FakePool()
        self.storage = FakeStorage(self.pool)
        self.sent: list[tuple[str, list[str]]] = []
        self.send_error: Exception | None = None
        self.pool.on("for update", [{"id": PROJECT_ID, "status": "draft"}])
        self.pool.on("insert into jobs", [JOB])

    def files(self, *rows: dict[str, Any], uploaded: bool = True) -> None:
        self.pool.on("from project_files", list(rows))
        if uploaded:
            self.storage.sizes.update({r["original_path"]: r["size_bytes"] for r in rows})

    def good_set(self) -> list[dict[str, Any]]:
        rows = [file_row("plan")] + [file_row("photo") for _ in range(3)]
        self.files(*rows)
        return rows


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
    app.dependency_overrides[get_storage] = lambda: e.storage
    app.dependency_overrides[current_user] = lambda: USER
    yield e
    app.dependency_overrides.clear()


@pytest.fixture
def client(env: Env) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def codes(response: Any) -> list[str]:
    return [d["code"] for d in response.json()["error"]["details"]]


def test_submit_marks_files_stores_details_creates_the_job_and_enqueues_it(
    client: TestClient, env: Env
) -> None:
    env.good_set()

    response = client.post(URL, json={"plan_page_index": 2, "area_m2": 55.5, "description": "piso"})

    assert response.status_code == 202
    assert response.json()["id"] == str(JOB["id"]) and response.json()["status"] == "queued"
    assert env.sent == [("ingest", [str(JOB["id"])])]
    assert len(env.pool.ran("set status = 'uploaded'")) == 4
    assert env.pool.ran("set page_index") == [(2, PROJECT_ID, USER.id)]
    assert env.pool.ran("set area_m2")[0][:2] == (55.5, "piso")


def test_submit_is_idempotent_while_a_job_is_active(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
    env.pool.on("from jobs", [JOB])

    first, second = client.post(URL, json={}), client.post(URL, json={})

    assert first.status_code == second.status_code == 202
    assert second.json()["id"] == str(JOB["id"])
    assert env.pool.ran("insert into jobs") == [] and env.sent == []


def test_a_missing_object_is_a_422_and_nothing_is_created(client: TestClient, env: Env) -> None:
    rows = env.good_set()
    del env.storage.sizes[rows[1]["original_path"]]

    response = client.post(URL, json={})

    assert response.status_code == 422
    assert codes(response) == ["missing_object"]
    assert env.pool.ran("insert into jobs") == [] and env.sent == []


def test_a_real_size_different_from_the_declared_one_is_a_422(client: TestClient, env: Env) -> None:
    rows = env.good_set()
    env.storage.sizes[rows[0]["original_path"]] = 999

    response = client.post(URL, json={})

    assert codes(response) == ["size_mismatch"]
    assert env.sent == []


@pytest.mark.parametrize(
    ("rows", "code"),
    [
        ([file_row("photo") for _ in range(3)], "missing_plan"),
        ([file_row("plan"), file_row("photo"), file_row("photo")], "too_few_photos"),
        ([], "missing_plan"),
    ],
)
def test_quantities_are_checked_before_touching_storage(
    client: TestClient, env: Env, rows: list[dict[str, Any]], code: str
) -> None:
    env.files(*rows)

    response = client.post(URL, json={})

    assert response.status_code == 422
    assert code in codes(response)
    assert env.sent == []


@pytest.mark.parametrize(
    "body",
    [
        {"area_m2": 0},
        {"area_m2": -1},
        {"description": "x" * 2001},
        {"plan_page_index": -1},
        {"x": 1},
    ],
)
def test_invalid_details_are_422(client: TestClient, env: Env, body: dict[str, Any]) -> None:
    env.good_set()

    assert client.post(URL, json=body).status_code == 422


def test_foreign_or_malformed_project_is_404(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()

    assert client.post(URL, json={}).status_code == 404
    assert client.post("/projects/nope/submit", json={}).status_code == 404


def test_a_project_that_is_neither_draft_nor_active_is_409(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "ready"}])

    assert client.post(URL, json={}).status_code == 409


def test_a_failed_enqueue_fails_the_job_and_frees_the_project(client: TestClient, env: Env) -> None:
    env.good_set()
    env.send_error = ConnectionError("redis down")

    response = client.post(URL, json={})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "enqueue_failed"
    assert env.pool.ran("set status = 'failed'") == [(JOB["id"], USER.id)]
    assert env.pool.ran("update projects set status = %s") == [("draft", PROJECT_ID, USER.id)]


def test_submit_has_its_own_rate_limit(client: TestClient, env: Env) -> None:
    limiter = RateLimiter(1, 60)
    app.dependency_overrides[submit_limiter] = lambda: limiter
    env.good_set()

    statuses = [client.post(URL, json={}).status_code for _ in range(2)]

    assert statuses == [202, 429]


def test_storage_is_checked_without_holding_a_database_connection(
    client: TestClient, env: Env
) -> None:
    env.good_set()

    client.post(URL, json={})

    assert env.storage.calls_in_transaction == []


def test_files_that_change_while_storage_is_checked_make_it_a_409(
    client: TestClient, env: Env
) -> None:
    before = [file_row("plan")] + [file_row("photo") for _ in range(3)]
    env.files(*before)
    env.pool.on_sequence("from project_files", before, before + [file_row("photo")])

    response = client.post(URL, json={})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "files_changed"
    assert env.sent == [] and env.pool.ran("insert into jobs") == []


def test_a_job_created_by_a_concurrent_submit_is_returned_not_duplicated(
    client: TestClient, env: Env
) -> None:
    env.good_set()
    env.pool.on_sequence("from jobs", [], [JOB])

    response = client.post(URL, json={})

    assert response.status_code == 202 and response.json()["id"] == str(JOB["id"])
    assert env.pool.ran("insert into jobs") == [] and env.sent == []


def test_two_plans_get_their_own_message(client: TestClient, env: Env) -> None:
    env.files(file_row("plan"), file_row("plan"), *[file_row("photo") for _ in range(3)])

    response = client.post(URL, json={})

    assert codes(response) == ["too_many_plans"]


@pytest.mark.parametrize(
    "raw",
    [
        b'{"area_m2": Infinity}',
        b'{"area_m2": NaN}',
        b'{"area_m2": 100001}',
        rb'{"description": "a\u0000b"}',
    ],
)
def test_non_finite_huge_or_control_character_details_are_422(
    client: TestClient, env: Env, raw: bytes
) -> None:
    env.good_set()

    response = client.post(URL, content=raw, headers={"content-type": "application/json"})

    assert response.status_code == 422


def test_a_description_may_have_line_breaks(client: TestClient, env: Env) -> None:
    env.good_set()

    assert client.post(URL, json={"description": "uno" + chr(10) + "dos"}).status_code == 202


def test_details_that_were_not_sent_do_not_erase_the_saved_ones(
    client: TestClient, env: Env
) -> None:
    env.good_set()

    client.post(URL, json={})

    sql = next(sql for sql, _ in env.pool.calls if "set area_m2" in sql)
    assert "coalesce(%s, area_m2)" in sql and "coalesce(%s, description)" in sql


def test_a_stale_queued_job_is_sent_again_on_resubmit(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
    env.pool.on("from jobs", [JOB | {"stale": True}])

    response = client.post(URL, json={})

    assert response.status_code == 202
    assert env.sent == [("ingest", [str(JOB["id"])])]


def test_a_stale_running_job_is_sent_again_on_resubmit(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
    env.pool.on("from jobs", [JOB | {"stale": True, "status": "running"}])

    client.post(URL, json={})

    assert env.sent == [("ingest", [str(JOB["id"])])]
    assert "claimed_at" in next(sql for sql, _ in env.pool.calls if "from jobs" in sql)


def test_a_fresh_job_is_not_sent_again(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
    env.pool.on("from jobs", [JOB | {"stale": False}])

    client.post(URL, json={})
    env.pool.answers[-1] = ("from jobs", [JOB | {"stale": False, "status": "running"}])
    client.post(URL, json={})

    assert env.sent == []


def test_a_failed_resend_is_a_503_that_leaves_the_job_queued(client: TestClient, env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "ingesting"}])
    env.pool.on("from jobs", [JOB | {"stale": True}])
    env.send_error = ConnectionError("redis down")

    response = client.post(URL, json={})

    assert response.status_code == 503
    assert env.pool.ran("set status = 'failed'") == []


def test_reopening_only_touches_a_project_that_is_still_ingesting(
    client: TestClient, env: Env
) -> None:
    env.good_set()
    env.send_error = ConnectionError("redis down")

    client.post(URL, json={})

    sql = next(sql for sql, _ in env.pool.calls if "update projects set status = %s" in sql)
    assert "status = 'ingesting'" in sql.split("where")[1]


def test_the_publisher_gives_up_quickly_when_redis_is_down(fake_env: None) -> None:
    configure_publisher()

    assert celery_app.conf.broker_connection_timeout <= 5
    assert celery_app.conf.broker_transport_options["socket_connect_timeout"] <= 5
    assert celery_app.conf.task_publish_retry_policy["max_retries"] <= 2


def needs_fix(env: Env, *rows: dict[str, Any]) -> None:
    env.pool.answers.clear()
    env.pool.on("for update", [{"id": PROJECT_ID, "status": "needs_fix"}])
    env.pool.on("insert into jobs", [JOB])
    env.files(*rows)


def test_a_needs_fix_submit_keeps_valid_files_and_marks_only_the_new_ones(
    client: TestClient, env: Env
) -> None:
    valid = [file_row("plan", status="valid")] + [file_row("photo", status="valid")] * 2
    fresh = file_row("photo")
    needs_fix(env, *valid, fresh)

    response = client.post(URL, json={"plan_page_index": 1})

    assert response.status_code == 202
    assert env.pool.ran("set status = 'uploaded'") == [(fresh["id"], PROJECT_ID, USER.id)]
    page_sql = next(sql for sql, _ in env.pool.calls if "set page_index" in sql)
    assert "status = 'uploaded'" in page_sql  # a valid plan keeps the page it was rendered with
    assert env.sent == [("ingest", [str(JOB["id"])])]


def test_a_needs_fix_submit_with_an_invalid_file_names_it_and_creates_nothing(
    client: TestClient, env: Env
) -> None:
    bad = file_row("photo", status="invalid")
    needs_fix(env, file_row("plan", status="valid"), bad, *[file_row("photo", status="valid")] * 2)

    response = client.post(URL, json={})

    assert response.status_code == 422
    (detail,) = response.json()["error"]["details"]
    assert detail["code"] == "invalid_file" and detail["file_id"] == str(bad["id"])
    assert detail["message"].startswith("Replace or remove ")
    assert bad["original_filename"] in detail["message"]
    assert env.pool.ran("insert into jobs") == [] and env.sent == []


def test_a_failed_enqueue_from_needs_fix_returns_the_project_to_needs_fix(
    client: TestClient, env: Env
) -> None:
    needs_fix(env, file_row("plan", status="valid"), *[file_row("photo") for _ in range(3)])
    env.send_error = ConnectionError("redis down")

    response = client.post(URL, json={})

    assert response.status_code == 503
    assert env.pool.ran("update projects set status = %s") == [("needs_fix", PROJECT_ID, USER.id)]
