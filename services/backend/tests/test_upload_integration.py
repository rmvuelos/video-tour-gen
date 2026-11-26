"""Upload flow against the local Supabase: real signed URLs, Storage and database."""

import os
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.errors import ApiError
from app.storage import get_storage
from app.worker import celery_app
from tests.conftest import Account

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("local_stack_only")]
TIMEOUT = 10
KINDS = ["plan", "photo", "photo", "photo"]
MIMES = {"plan": "application/pdf", "photo": "image/jpeg"}
EXTENSIONS = {"plan": "pdf", "photo": "jpg"}


def _put(url: str, headers: dict[str, str], content: bytes) -> None:
    # The URL is the public one (127.0.0.1); the test container reaches the host by this name.
    local = url.replace("127.0.0.1", "host.docker.internal")
    httpx.put(local, headers=headers, content=content, timeout=TIMEOUT).raise_for_status()


def _register(client: TestClient, user: Account, sizes: list[int]) -> tuple[str, list[Any]]:
    project = client.post("/projects", json={"name": "Casa"}, headers=user.headers).json()
    files = [
        {"kind": k, "filename": f"f{i}.{EXTENSIONS[k]}", "size": s, "mime": MIMES[k]}
        for i, (k, s) in enumerate(zip(KINDS, sizes, strict=True))
    ]
    response = client.post(
        f"/projects/{project['id']}/files", json={"files": files}, headers=user.headers
    )
    assert response.status_code == 201
    return project["id"], response.json()["files"]


def test_signed_upload_then_submit_queues_one_ingest_job(
    client: TestClient, make_user: Callable[[], Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, list[str]]] = []
    # No Redis in the db job: what matters here is the exact send_task call, not the broker.
    monkeypatch.setattr(celery_app, "send_task", lambda name, args: sent.append((name, args)))
    ana = make_user()
    project_id, targets = _register(client, ana, [20, 30, 30, 30])
    for target, size in zip(targets, [20, 30, 30, 30], strict=True):
        _put(target["upload_url"], target["headers"], b"x" * size)

    first = client.post(f"/projects/{project_id}/submit", json={"area_m2": 50}, headers=ana.headers)
    again = client.post(f"/projects/{project_id}/submit", json={}, headers=ana.headers)

    assert first.status_code == 202 and first.json()["status"] == "queued"
    assert again.json()["id"] == first.json()["id"]
    assert sent == [("ingest", [first.json()["id"]])]
    project = client.get(f"/projects/{project_id}", headers=ana.headers).json()
    assert (project["status"], project["area_m2"]) == ("ingesting", 50)


def test_missing_and_wrong_size_objects_block_the_submit(
    client: TestClient, make_user: Callable[[], Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(celery_app, "send_task", lambda name, args: pytest.fail("enqueued"))
    ana = make_user()
    project_id, targets = _register(client, ana, [20, 30, 30, 30])
    _put(targets[0]["upload_url"], targets[0]["headers"], b"x" * 20)
    _put(targets[1]["upload_url"], targets[1]["headers"], b"x" * 31)  # declared 30
    _put(targets[2]["upload_url"], targets[2]["headers"], b"x" * 30)
    # targets[3] is never uploaded

    response = client.post(f"/projects/{project_id}/submit", json={}, headers=ana.headers)

    assert response.status_code == 422
    details = response.json()["error"]["details"]
    found = {(d["file_id"], d["code"]) for d in details}
    assert found == {
        (targets[1]["file_id"], "size_mismatch"),
        (targets[3]["file_id"], "missing_object"),
    }
    assert client.get(f"/projects/{project_id}", headers=ana.headers).json()["status"] == "draft"


def _upload_all(targets: list[Any], sizes: list[int]) -> None:
    for target, size in zip(targets, sizes, strict=True):
        _put(target["upload_url"], target["headers"], b"x" * size)


def test_a_signed_url_cannot_overwrite_an_uploaded_object(
    client: TestClient, make_user: Callable[[], Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[Any] = []
    monkeypatch.setattr(celery_app, "send_task", lambda name, args: sent.append(args))
    ana = make_user()
    project_id, targets = _register(client, ana, [20, 30, 30, 30])
    _upload_all(targets, [20, 30, 30, 30])

    second = httpx.put(
        targets[0]["upload_url"].replace("127.0.0.1", "host.docker.internal"),
        headers=targets[0]["headers"],
        content=b"y" * 99,
        timeout=TIMEOUT,
    )

    assert second.status_code in (400, 409)
    submit = client.post(f"/projects/{project_id}/submit", json={}, headers=ana.headers)
    assert submit.status_code == 202  # the declared size still matches: nothing was replaced


def test_delete_removes_the_real_object(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana = make_user()
    project_id, targets = _register(client, ana, [20, 30, 30, 30])
    _upload_all(targets, [20, 30, 30, 30])
    path = f"{ana.id}/{project_id}/{targets[1]['file_id']}"
    info = f"{os.environ['SUPABASE_URL']}/storage/v1/object/info/originals/{path}"
    secret = {"apikey": os.environ["SUPABASE_SECRET_KEY"]}
    assert httpx.get(info, headers=secret, timeout=TIMEOUT).status_code == 200

    deleted = client.delete(
        f"/projects/{project_id}/files/{targets[1]['file_id']}", headers=ana.headers
    )

    assert deleted.status_code == 204
    assert httpx.get(info, headers=secret, timeout=TIMEOUT).status_code in (400, 404)


def test_a_non_finite_area_is_rejected(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana = make_user()
    project = client.post("/projects", json={"name": "Casa"}, headers=ana.headers).json()

    response = client.post(
        f"/projects/{project['id']}/submit",
        content=b'{"area_m2": Infinity}',
        headers={**ana.headers, "content-type": "application/json"},
    )

    assert response.status_code == 422


class _BrokenSigner:
    def signed_upload_url(self, path: str) -> str:
        raise ApiError(502, "storage_unavailable", "down")


def test_a_signing_failure_leaves_no_rows_taking_up_slots(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana = make_user()
    project = client.post("/projects", json={"name": "Casa"}, headers=ana.headers).json()
    url = f"/projects/{project['id']}/files"
    full = [{"kind": "plan", "filename": "p.pdf", "size": 5, "mime": "application/pdf"}] + [
        {"kind": "photo", "filename": f"{i}.jpg", "size": 5, "mime": "image/jpeg"}
        for i in range(10)
    ]
    app.dependency_overrides[get_storage] = _BrokenSigner
    try:
        failed = client.post(url, json={"files": full}, headers=ana.headers)
    finally:
        app.dependency_overrides.pop(get_storage)

    retried = client.post(url, json={"files": full}, headers=ana.headers)

    assert failed.status_code == 502
    assert retried.status_code == 201  # the maximum fits again: the failed rows are gone


def test_lists_only_your_files_plan_first(
    client: TestClient, make_user: Callable[[], Account]
) -> None:
    ana, ben = make_user(), make_user()
    project = client.post("/projects", json={"name": "Casa"}, headers=ana.headers).json()
    url = f"/projects/{project['id']}/files"

    def add(kind: str, name: str) -> str:
        item = {"kind": kind, "filename": name, "size": 20, "mime": MIMES[kind]}
        response = client.post(url, json={"files": [item]}, headers=ana.headers)
        assert response.status_code == 201
        return str(response.json()["files"][0]["file_id"])

    photos = [add("photo", "a.jpg"), add("photo", "b.jpg")]
    plan_id = add("plan", "p.pdf")  # registered last: first only thanks to the ordering

    listed = client.get(url, headers=ana.headers)
    foreign = client.get(url, headers=ben.headers)
    unknown = client.get(f"/projects/{uuid4()}/files", headers=ben.headers)

    assert listed.status_code == 200
    files = listed.json()["files"]
    assert [f["id"] for f in files] == [plan_id, *photos]
    assert files[0] == {
        "id": plan_id,
        "kind": "plan",
        "filename": "p.pdf",
        "size": 20,
        "mime": "application/pdf",
        "status": "pending",
        "error_code": None,
        "page_index": None,
    }
    assert foreign.status_code == unknown.status_code == 404
    assert foreign.json() == unknown.json()
