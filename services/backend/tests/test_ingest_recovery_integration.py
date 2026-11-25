"""Duplicate, lost and failing deliveries of the ingest task, against the real database.

Rows are seeded with SQL (the API flow is covered elsewhere) so each job can start in any state.
"""

import os
import uuid
from datetime import UTC, datetime, timedelta
from collections.abc import Callable, Iterator
from typing import Any

import psycopg
import pytest
from celery.exceptions import Retry
from psycopg.rows import dict_row

import app.worker.ingest as job_module
from app.errors import ApiError
from app.storage import create_storage
from app.worker.ingest import MAX_ATTEMPTS, ingest
from tests.conftest import Account
from tests.ingest_fixtures import image_bytes

NOW = datetime.now(UTC)
LONG_AGO = NOW - timedelta(hours=3)
pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("local_stack_only")]


@pytest.fixture
def db() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True) as conn:
        yield conn


@pytest.fixture
def seed(
    db: psycopg.Connection[dict[str, Any]], make_user: Callable[[], Account]
) -> Iterator[Callable[..., tuple[str, str]]]:
    storage = create_storage()

    def make(status: str, **job: datetime | int) -> tuple[str, str]:
        user = make_user().id
        project, file_id = str(uuid.uuid4()), str(uuid.uuid4())
        path = f"{user}/{project}/{file_id}"
        data = image_bytes("JPEG", (200, 100))
        db.execute(
            "insert into projects (id, user_id, name, status) values (%s, %s, 'Casa', 'ingesting')",
            (project, user),
        )
        db.execute(
            "insert into project_files (id, project_id, user_id, kind, original_filename, "
            "declared_mime, size_bytes, original_path, status) "
            "values (%s, %s, %s, 'photo', 'a.jpg', 'image/jpeg', %s, %s, 'uploaded')",
            (file_id, project, user, len(data), path),
        )
        storage.upload("originals", path, data, "image/jpeg")
        columns = ["project_id", "user_id", "type", "status", *job]
        marks = ", ".join(["%s"] * len(columns))
        row = db.execute(
            f"insert into jobs ({', '.join(columns)}) values ({marks}) returning id",
            [project, user, "ingest", status, *job.values()],
        ).fetchone()
        assert row
        return str(row["id"]), file_id

    yield make
    storage.close()


def state(db: psycopg.Connection[dict[str, Any]], job_id: str, file_id: str) -> tuple[str, int, str]:
    job = db.execute("select status, attempts from jobs where id = %s", (job_id,)).fetchone()
    file = db.execute("select status from project_files where id = %s", (file_id,)).fetchone()
    assert job and file
    return job["status"], job["attempts"], file["status"]


def test_a_duplicate_message_for_a_done_or_fresh_running_job_does_nothing(
    db: psycopg.Connection[dict[str, Any]], seed: Callable[..., tuple[str, str]]
) -> None:
    done, done_file = seed("done", finished_at=NOW, started_at=NOW)
    running, running_file = seed("running", claimed_at=NOW, started_at=NOW, attempts=1)

    ingest.apply(args=[done], throw=True)
    ingest.apply(args=[running], throw=True)

    assert state(db, done, done_file) == ("done", 0, "uploaded")
    assert state(db, running, running_file) == ("running", 1, "uploaded")


def test_a_transient_failure_requeues_and_the_next_delivery_claims_it_again(
    db: psycopg.Connection[dict[str, Any]],
    seed: Callable[..., tuple[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    job, file_id = seed("queued")
    storage = job_module._dependencies()[1]
    monkeypatch.setattr(
        storage, "upload", lambda *a: (_ for _ in ()).throw(ApiError(502, "storage_unavailable", "x"))
    )
    monkeypatch.setattr(ingest, "retry", lambda **_: (_ for _ in ()).throw(Retry()))

    ingest.apply(args=[job])

    assert state(db, job, file_id) == ("queued", 1, "uploaded")
    monkeypatch.undo()
    ingest.apply(args=[job], throw=True)
    assert state(db, job, file_id) == ("done", 2, "valid")


def test_a_running_job_whose_worker_died_is_recovered(
    db: psycopg.Connection[dict[str, Any]], seed: Callable[..., tuple[str, str]]
) -> None:
    job, file_id = seed("running", claimed_at=LONG_AGO, started_at=LONG_AGO, attempts=1)

    ingest.apply(args=[job], throw=True)

    assert state(db, job, file_id) == ("done", 2, "valid")


def test_a_job_that_keeps_killing_its_worker_ends_as_worker_lost(
    db: psycopg.Connection[dict[str, Any]], seed: Callable[..., tuple[str, str]]
) -> None:
    job, file_id = seed("queued", attempts=MAX_ATTEMPTS, started_at=NOW)

    ingest.apply(args=[job], throw=True)

    row = db.execute("select status, error_code from jobs where id = %s", (job,)).fetchone()
    assert row == {"status": "failed", "error_code": "worker_lost"}
    assert state(db, job, file_id)[2] == "uploaded"


def test_a_requeue_that_fails_does_not_leave_the_job_running(
    db: psycopg.Connection[dict[str, Any]],
    seed: Callable[..., tuple[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    job, file_id = seed("queued")
    storage = job_module._dependencies()[1]
    monkeypatch.setattr(
        storage, "upload", lambda *a: (_ for _ in ()).throw(ApiError(502, "storage_unavailable", "x"))
    )
    # kills the connection that runs it: an OperationalError, like a database restart
    monkeypatch.setattr(job_module, "REQUEUE", "select pg_terminate_backend(pg_backend_pid())")

    ingest.apply(args=[job], throw=True)

    row = db.execute("select status, error_code from jobs where id = %s", (job,)).fetchone()
    assert row == {"status": "failed", "error_code": "storage_unavailable"}
