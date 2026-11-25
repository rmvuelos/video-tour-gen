"""Against the local Supabase stack, with real Auth tokens (see scripts/run-integration.mjs)."""

import uuid
from collections.abc import Callable

import pytest
from conftest import Account
from fastapi.testclient import TestClient

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("local_stack_only")]


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
