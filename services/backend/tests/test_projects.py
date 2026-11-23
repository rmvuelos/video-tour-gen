import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg_pool import PoolTimeout

from app.api import app
from app.auth import CurrentUser, current_user
from app.db import get_pool

USER = CurrentUser(id=uuid.uuid4(), email="ana@example.test")
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _row(name: str = "Casa") -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "name": name,
        "status": "draft",
        "area_m2": None,
        "description": None,
        "created_at": NOW,
        "updated_at": NOW,
    }


class FakePool:
    """Stands in for ConnectionPool: records the SQL and answers with canned rows."""

    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.connect_error: Exception | None = None
        self.execute_error: Exception | None = None
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    @contextmanager
    def connection(self, timeout: float | None = None) -> Iterator["FakePool"]:
        if self.connect_error:
            raise self.connect_error
        yield self

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> "FakePool":
        self.calls.append((sql, params))
        if self.execute_error:
            raise self.execute_error
        return self

    def fetchone(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


@pytest.fixture
def pool() -> FakePool:
    return FakePool()


@pytest.fixture
def client(pool: FakePool, fake_env: None) -> Iterator[TestClient]:
    app.dependency_overrides[get_pool] = lambda: pool
    app.dependency_overrides[current_user] = lambda: USER
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("sent", "stored"),
    [("  Casa  ", "Casa"), ("x" * 120, "x" * 120), ("Ñandú 🏠'; --", "Ñandú 🏠'; --")],
)
def test_create_stores_trimmed_name_for_the_current_user(
    client: TestClient, pool: FakePool, sent: str, stored: str
) -> None:
    pool.rows = [_row(stored)]

    response = client.post("/projects", json={"name": sent})

    assert response.status_code == 201
    assert response.json()["name"] == stored
    assert set(response.json()) == {
        "id", "name", "status", "area_m2", "description", "created_at", "updated_at"
    }  # fmt: skip
    assert pool.calls[0][1] == (USER.id, stored)


@pytest.mark.parametrize(
    "body",
    [{}, {"name": ""}, {"name": "   "}, {"name": "x" * 121}, {"name": 1}, {"name": None},
     {"name": "ok", "user_id": str(uuid.uuid4())}],
)  # fmt: skip
def test_create_rejects_invalid_body_without_touching_the_db(
    client: TestClient, pool: FakePool, body: dict[str, Any]
) -> None:
    response = client.post("/projects", json=body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert pool.calls == []


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "limit=x", "offset=-1"])
def test_list_rejects_invalid_pagination(client: TestClient, query: str) -> None:
    response = client.get(f"/projects?{query}")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.parametrize(
    ("query", "limit", "offset"), [("", 20, 0), ("?limit=100&offset=5", 100, 5), ("?limit=1", 1, 0)]
)
def test_list_returns_the_page_of_the_current_user(
    client: TestClient, pool: FakePool, query: str, limit: int, offset: int
) -> None:
    pool.rows = [_row("B"), _row("A")]

    response = client.get(f"/projects{query}")

    assert response.status_code == 200
    body = response.json()
    assert [p["name"] for p in body["items"]] == ["B", "A"]
    assert (body["limit"], body["offset"]) == (limit, offset)
    assert pool.calls[0][1] == (USER.id, limit, offset)
    assert "order by created_at desc, id desc" in pool.calls[0][0]


def test_get_returns_own_project(client: TestClient, pool: FakePool) -> None:
    row = _row()
    pool.rows = [row]

    response = client.get(f"/projects/{row['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == str(row["id"])
    assert pool.calls[0][1] == (row["id"], USER.id)


def test_get_answers_the_same_404_for_missing_foreign_and_malformed_ids(
    client: TestClient, pool: FakePool
) -> None:
    missing = client.get(f"/projects/{uuid.uuid4()}")  # foreign rows are filtered out by SQL too
    malformed = client.get("/projects/not-a-uuid")

    assert missing.status_code == malformed.status_code == 404
    assert missing.json() == malformed.json()
    assert missing.json()["error"]["code"] == "not_found"
    assert len(pool.calls) == 1  # the malformed id never reaches the DB


@pytest.mark.parametrize("path", ["/projects", "/projects/" + str(uuid.uuid4())])
def test_endpoints_require_a_token(fake_env: None, path: str) -> None:
    assert TestClient(app).get(path).status_code == 401


@pytest.mark.parametrize(
    ("where", "error"),
    [
        ("connect_error", PoolTimeout("no connection")),
        ("execute_error", psycopg.OperationalError("server closed the connection")),
    ],
)
def test_db_down_is_503(client: TestClient, pool: FakePool, where: str, error: Exception) -> None:
    setattr(pool, where, error)

    response = client.get("/projects")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "db_unavailable"


def test_unexpected_db_error_is_500_without_details(client: TestClient, pool: FakePool) -> None:
    pool.execute_error = psycopg.errors.UndefinedTable('relation "projects" does not exist')

    response = client.get("/projects")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "Something went wrong."}
    }
