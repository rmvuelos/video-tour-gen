"""The ingest task against the local Supabase: real Storage, real database, real sandbox.

`task.apply()` runs it in this process; CI has no Celery worker or Redis in the db job, and
the queueing itself (send_task) is covered by the submit tests. The prefork worker is only
configuration (`celery worker -P prefork`), so a real one adds start-up time but no coverage.
"""

import io
from collections.abc import Callable, Iterator
from typing import Any

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.storage import StorageClient, create_storage
from app.worker import celery_app
from app.worker.ingest import ingest
from tests.conftest import Account
from tests.ingest_fixtures import encrypted_pdf_bytes, image_bytes, pdf_bytes

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("local_stack_only")]
TIMEOUT = 10
GPS_IFD = 0x8825
CAP = 20 * 1024**2


@pytest.fixture
def storage() -> Iterator[StorageClient]:
    client = create_storage()
    try:
        yield client
    finally:
        client.close()


def gps_jpeg() -> bytes:
    exif = Image.Exif()
    exif[0x0110] = "SecretCam 9000"
    exif.get_ifd(GPS_IFD)[2] = (40.0, 26.0, 46.0)
    return image_bytes("JPEG", (3000, 2000), exif=exif)


def run_project(
    client: TestClient, user: Account, plan: bytes, photos: list[bytes], mp: pytest.MonkeyPatch
) -> tuple[str, dict[str, Any], list[Any]]:
    """Register, upload and submit a project, then run its ingest. Returns the polling body."""
    sent: list[str] = []
    mp.setattr(celery_app, "send_task", lambda name, args: sent.append(args[0]))
    project = client.post("/projects", json={"name": "Casa"}, headers=user.headers).json()["id"]
    blobs = [("plan", "application/pdf", "plan.pdf", plan)] + [
        ("photo", "image/jpeg", f"f{i}.jpg", data) for i, data in enumerate(photos)
    ]
    files = [
        {"kind": kind, "filename": name, "size": len(data), "mime": mime}
        for kind, mime, name, data in blobs
    ]
    registered = client.post(
        f"/projects/{project}/files", json={"files": files}, headers=user.headers
    ).json()["files"]
    for target, (*_, data) in zip(registered, blobs, strict=True):
        url = target["upload_url"].replace("127.0.0.1", "host.docker.internal")
        httpx.put(url, headers=target["headers"], content=data, timeout=TIMEOUT).raise_for_status()
    submit = client.post(
        f"/projects/{project}/submit", json={"plan_page_index": 1}, headers=user.headers
    )
    assert submit.status_code == 202 and sent == [submit.json()["id"]]

    ingest.apply(args=[sent[0]], throw=True)

    latest = client.get(f"/projects/{project}/jobs/latest", headers=user.headers).json()
    return project, latest, registered


def test_a_pdf_and_three_photos_become_clean_derivatives(
    client: TestClient,
    make_user: Callable[[], Account],
    monkeypatch: pytest.MonkeyPatch,
    storage: StorageClient,
) -> None:
    ana = make_user()

    photos = [gps_jpeg(), image_bytes("JPEG"), image_bytes("PNG")]
    project, latest, registered = run_project(client, ana, pdf_bytes(3), photos, monkeypatch)

    assert latest["status"] == "done" and latest["duration_ms"] >= 0 and latest["attempts"] == 1
    assert [f["status"] for f in latest["files"]] == ["valid"] * 4
    assert client.get(f"/projects/{project}", headers=ana.headers).json()["status"] == "ready"
    for item in latest["files"]:
        base = f"{ana.id}/{project}/{item['id']}"
        extension = "png" if item["kind"] == "plan" else "jpg"
        main = storage.download("derived", f"{base}/main.{extension}", CAP)
        thumb = storage.download("derived", f"{base}/thumb.jpg", CAP)
        assert main and thumb
        image = Image.open(io.BytesIO(main))
        assert (image.width, image.height) == (item["width"], item["height"])
        assert len(image.getexif()) == 0 and b"SecretCam" not in main  # no EXIF, no GPS
    gps_id = registered[1]["file_id"]  # the first photo, the one with GPS
    originals = storage.download("originals", f"{ana.id}/{project}/{gps_id}", CAP)
    assert originals and b"SecretCam" in originals  # the original is untouched


def test_hostile_files_are_invalid_with_a_code(
    client: TestClient, make_user: Callable[[], Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    ana = make_user()
    photos = [b"not an image", image_bytes("JPEG"), image_bytes("JPEG")]

    project, latest, registered = run_project(
        client, ana, encrypted_pdf_bytes(), photos, monkeypatch
    )
    by_id = {f["id"]: (f["status"], f["error_code"]) for f in latest["files"]}

    assert latest["status"] == "done"  # the job ran; the files are what is wrong
    assert [by_id[r["file_id"]] for r in registered] == [
        ("invalid", "pdf_encrypted"),
        ("invalid", "unsupported_type"),
        ("valid", None),
        ("valid", None),
    ]
    assert client.get(f"/projects/{project}", headers=ana.headers).json()["status"] == "needs_fix"
