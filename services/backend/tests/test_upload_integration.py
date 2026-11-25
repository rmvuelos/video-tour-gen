"""Upload flow against the local Supabase: real signed URLs, Storage and database."""

from collections.abc import Callable
from typing import Any

import httpx2 as httpx
import pytest
from conftest import Account
from fastapi.testclient import TestClient

from app.worker import celery_app

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
