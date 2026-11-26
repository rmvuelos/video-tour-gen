import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import current_user
from app.db import get_pool
from app.errors import ApiError
from app.ratelimit import RateLimiter, files_limiter, read_limiter
from app.storage import get_storage
from tests.fakes import PROJECT_ID, USER, FakePool, FakeStorage

URL = f"/projects/{PROJECT_ID}/files"
MIB = 1024 * 1024


def plan(**over: Any) -> dict[str, Any]:
    return {"kind": "plan", "filename": "plano.pdf", "size": MIB, "mime": "application/pdf"} | over


def photo(**over: Any) -> dict[str, Any]:
    return {"kind": "photo", "filename": "sala.jpg", "size": MIB, "mime": "image/jpeg"} | over


@pytest.fixture
def pool() -> FakePool:
    fake = FakePool()
    fake.on("for update", [{"id": PROJECT_ID, "status": "draft"}])
    return fake


@pytest.fixture
def storage(pool: FakePool) -> FakeStorage:
    return FakeStorage(pool)


@pytest.fixture
def client(pool: FakePool, storage: FakeStorage, fake_env: None) -> Iterator[TestClient]:
    limiter = RateLimiter(1000, 60)  # each test gets a fresh, generous budget
    app.dependency_overrides[files_limiter] = lambda: limiter
    app.dependency_overrides[get_pool] = lambda: pool
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[current_user] = lambda: USER
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def test_registers_pending_rows_and_returns_one_signed_url_per_file(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    response = client.post(URL, json={"files": [plan(), photo(filename="Ñandú 🏠.jpg")]})

    assert response.status_code == 201
    files = response.json()["files"]
    assert [f["kind"] for f in files] == ["plan", "photo"]
    for item in files:
        path = f"{USER.id}/{PROJECT_ID}/{item['file_id']}"
        assert item["upload_url"] == f"http://public.test/upload/{path}?token=t"
        assert item["headers"] == {"Content-Type": item["mime"]}
    assert len(pool.ran("insert into project_files")) == 2
    assert all("sala" not in p and "plano" not in p for p in storage.signed)  # no names in paths


def test_counts_the_files_already_registered(client: TestClient, pool: FakePool) -> None:
    pool.on("group by kind", [{"kind": "photo", "n": 8}, {"kind": "plan", "n": 1}])

    ok = client.post(URL, json={"files": [photo(), photo()]})
    too_many = client.post(URL, json={"files": [photo(), photo(), photo()]})
    second_plan = client.post(URL, json={"files": [plan()]})

    assert ok.status_code == 201
    assert too_many.status_code == 422
    assert second_plan.status_code == 422
    assert second_plan.json()["error"]["details"][0]["code"] == "too_many_files"


@pytest.mark.parametrize(
    ("item", "code"),
    [
        (plan(mime="image/webp", filename="p.webp"), "unsupported_type"),
        (plan(filename="plano.exe"), "unsupported_type"),
        (photo(filename="IMG_1.heic", mime="image/heic"), "unsupported_type"),
        (photo(filename="a.jpg", mime="application/pdf"), "unsupported_type"),
        (plan(size=20 * MIB + 1), "too_large"),
        (photo(size=12 * MIB + 1), "too_large"),
    ],
)
def test_rejects_by_file_with_a_code_and_registers_nothing(
    client: TestClient, pool: FakePool, storage: FakeStorage, item: dict[str, Any], code: str
) -> None:
    response = client.post(URL, json={"files": [photo(), item]})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_files"
    assert [(d["index"], d["code"]) for d in error["details"]] == [(1, code)]
    assert item["filename"] in error["details"][0]["message"]
    assert pool.ran("insert into") == [] and storage.signed == []


def test_heic_message_tells_what_to_do(client: TestClient) -> None:
    response = client.post(URL, json={"files": [photo(filename="IMG.HEIC", mime="image/heic")]})

    assert "Export as JPG" in response.json()["error"]["details"][0]["message"]


@pytest.mark.parametrize(
    "body",
    [
        {"files": []},
        {"files": [photo(size=0)]},
        {"files": [photo(kind="video")]},
        {},
        {"files": [photo()] * 12},
    ],
)
def test_malformed_body_is_422(client: TestClient, body: dict[str, Any]) -> None:
    assert client.post(URL, json=body).status_code == 422


def test_unknown_foreign_or_malformed_project_is_404(client: TestClient, pool: FakePool) -> None:
    pool.answers.clear()  # the lookup filtered by user_id finds nothing

    assert client.post(URL, json={"files": [photo()]}).status_code == 404
    assert client.post("/projects/nope/files", json={"files": [photo()]}).status_code == 404
    assert pool.ran("for update")[0] == (PROJECT_ID, USER.id)


@pytest.mark.parametrize("status", ["ingesting", "ready"])
def test_only_editable_projects_accept_files(
    client: TestClient, pool: FakePool, status: str
) -> None:
    pool.answers.clear()
    pool.on("for update", [{"id": PROJECT_ID, "status": status}])

    response = client.post(URL, json={"files": [photo()]})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "project_not_editable"


def test_a_needs_fix_project_accepts_files_counting_the_ones_that_remain(
    client: TestClient, pool: FakePool
) -> None:
    pool.answers.clear()
    pool.on("for update", [{"id": PROJECT_ID, "status": "needs_fix"}])
    pool.on_sequence(
        "group by kind",
        [{"kind": "plan", "n": 1}, {"kind": "photo", "n": 10}],
        [{"kind": "plan", "n": 1}, {"kind": "photo", "n": 9}],
    )

    full = client.post(URL, json={"files": [photo()]})
    room = client.post(URL, json={"files": [photo()]})

    assert full.status_code == 422
    assert full.json()["error"]["details"][0]["code"] == "too_many_files"
    assert room.status_code == 201
    assert len(pool.ran("insert into project_files")) == 1


def test_delete_removes_the_objects_and_the_row(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    file_id = uuid.uuid4()
    path = f"{USER.id}/{PROJECT_ID}/{file_id}"
    pool.on("from project_files", [{"id": file_id, "original_path": path}])

    response = client.delete(f"{URL}/{file_id}")

    assert response.status_code == 204
    assert storage.deleted == [("originals", [path])]
    assert storage.prefixes == [("derived", path)]
    assert pool.ran("delete from project_files") == [(file_id, PROJECT_ID, USER.id)]


def test_delete_of_a_file_that_is_not_yours_is_404_and_touches_nothing(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    response = client.delete(f"{URL}/{uuid.uuid4()}")

    assert response.status_code == 404
    assert storage.deleted == [] and pool.ran("delete from") == []
    assert client.delete(f"{URL}/not-a-uuid").status_code == 404


@pytest.mark.parametrize("status", ["ingesting", "ready"])
def test_delete_only_when_editable(
    client: TestClient, pool: FakePool, storage: FakeStorage, status: str
) -> None:
    pool.answers.clear()
    pool.on("for update", [{"id": PROJECT_ID, "status": status}])

    response = client.delete(f"{URL}/{uuid.uuid4()}")

    assert response.status_code == 409
    assert storage.deleted == []


def test_a_needs_fix_project_can_delete_a_file_and_its_derivatives(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    file_id = uuid.uuid4()
    path = f"{USER.id}/{PROJECT_ID}/{file_id}"
    pool.answers.clear()
    pool.on("for update", [{"id": PROJECT_ID, "status": "needs_fix"}])
    pool.on("from project_files", [{"id": file_id, "original_path": path}])

    response = client.delete(f"{URL}/{file_id}")

    assert response.status_code == 204
    assert storage.deleted == [("originals", [path])] and storage.prefixes == [("derived", path)]


def test_storage_is_never_called_while_the_project_lock_is_held(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    file_id = uuid.uuid4()
    pool.on(
        "select id, original_path", [{"id": file_id, "original_path": f"{USER.id}/{PROJECT_ID}/x"}]
    )

    client.post(URL, json={"files": [photo()]})
    client.delete(f"{URL}/{file_id}")

    assert storage.signed and storage.deleted
    assert storage.calls_in_transaction == []


def test_a_signing_failure_removes_the_pending_rows_and_is_a_502(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    storage.sign_error = ApiError(502, "storage_unavailable", "down")

    response = client.post(URL, json={"files": [photo(), photo()]})

    assert response.status_code == 502
    assert len(pool.ran("delete from project_files where id = any")) == 1


def test_a_storage_failure_after_the_row_is_gone_still_answers_204(
    client: TestClient, pool: FakePool, storage: FakeStorage
) -> None:
    file_id = uuid.uuid4()
    pool.on("from project_files", [{"id": file_id, "original_path": f"{USER.id}/{PROJECT_ID}/x"}])
    storage.delete_error = ApiError(502, "storage_unavailable", "down")

    response = client.delete(f"{URL}/{file_id}")

    assert response.status_code == 204
    assert len(pool.ran("delete from project_files where id = %s")) == 1


@pytest.mark.parametrize(
    "path", ["", "other/user/file", f"{USER.id}/{uuid.uuid4()}/f", f"{USER.id}/{PROJECT_ID}"]
)
def test_a_stored_path_outside_the_project_prefix_is_never_deleted(
    client: TestClient, pool: FakePool, storage: FakeStorage, path: str
) -> None:
    file_id = uuid.uuid4()
    pool.on("from project_files", [{"id": file_id, "original_path": path}])

    response = client.delete(f"{URL}/{file_id}")

    assert response.status_code == 500
    assert storage.deleted == [] and storage.prefixes == []
    assert pool.ran("delete from project_files where id = %s") == []


@pytest.mark.parametrize(
    "name",
    ["a/b.jpg", "a\\b.jpg", "a\u0000.jpg", "a\u200b.jpg", "\u202egpj.exe"],
)
def test_filenames_with_separators_or_invisible_characters_are_422(
    client: TestClient, name: str
) -> None:
    assert client.post(URL, json={"files": [photo(filename=name)]}).status_code == 422


def _row(**over: Any) -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "kind": "photo",
        "original_filename": "sala.jpg",
        "size_bytes": 123,
        "declared_mime": "image/jpeg",
        "status": "valid",
        "error_code": None,
        "page_index": None,
    } | over


@pytest.fixture
def lister(client: TestClient, pool: FakePool) -> TestClient:
    app.dependency_overrides[read_limiter] = lambda: RateLimiter(1000, 60)
    pool.on("from projects where", [{"id": PROJECT_ID}])
    return client


def test_lists_the_files_with_the_public_fields_and_no_paths(
    lister: TestClient, pool: FakePool
) -> None:
    plan_row = _row(kind="plan", original_filename="p.pdf", declared_mime="application/pdf")
    bad = _row(status="invalid", error_code="corrupt_image")
    pool.on("from project_files", [plan_row, bad])

    response = lister.get(URL)

    assert response.status_code == 200
    first, second = response.json()["files"]
    assert first == {
        "id": str(plan_row["id"]),
        "kind": "plan",
        "filename": "p.pdf",
        "size": 123,
        "mime": "application/pdf",
        "status": "valid",
        "error_code": None,
        "page_index": None,
    }
    assert (second["status"], second["error_code"]) == ("invalid", "corrupt_image")
    assert "path" not in response.text
    sql = pool.ran("from project_files")[0]
    assert sql == (PROJECT_ID, USER.id)
    assert "path" not in next(q for q, _ in pool.calls if "from project_files" in q)
    assert "order by (kind = 'plan') desc, created_at, id" in next(
        q for q, _ in pool.calls if "from project_files" in q
    )


def test_a_project_without_files_is_an_empty_list(lister: TestClient) -> None:
    response = lister.get(URL)

    assert (response.status_code, response.json()) == (200, {"files": []})


def test_listing_unknown_foreign_or_malformed_project_is_404(
    lister: TestClient, pool: FakePool
) -> None:
    pool.answers.clear()
    pool.on("from project_files", [_row()])  # never reached

    missing, malformed = lister.get(URL), lister.get("/projects/nope/files")

    assert missing.status_code == malformed.status_code == 404
    assert missing.json() == malformed.json()
    assert not pool.ran("from project_files")


def test_listing_requires_a_token(fake_env: None) -> None:
    assert TestClient(app).get(URL).status_code == 401


def test_listing_is_rate_limited(lister: TestClient) -> None:
    app.dependency_overrides[read_limiter] = lambda: RateLimiter(1, 60)

    assert [lister.get(URL).status_code for _ in range(2)] == [200, 429]
