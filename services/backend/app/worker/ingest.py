"""The `ingest(job_id)` task: one job = every `uploaded` file of a project.

Celery prefork only (never threads: pdfium). Each DB step is its own short transaction and no
network call happens while a connection is held. Only Storage/DB outages are retried; a bad
file is a result (`invalid` + code), never an error. A failed attempt puts the job back in
`queued` so the claim can win again, and files already done are skipped on the retry.
"""

import functools
import logging
from typing import Any

import psycopg
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded

from app.db import Pool, connection, create_pool
from app.errors import ApiError
from app.files import input_limits
from app.ingest import IngestError, IngestErrorCode
from app.ingest.media import FileKind
from app.ingest.sandbox import process_file
from app.storage import DERIVED, ORIGINALS, ObjectStorage, create_storage
from app.worker import celery_app

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BACKOFF_SECONDS = 5  # 5, 10, 20
SOFT_TIME_LIMIT = 900  # 11 files x the 60 s wall limit of the sandbox, with slack
HARD_TIME_LIMIT = SOFT_TIME_LIMIT + 60
TRANSIENT = (ApiError, psycopg.OperationalError)  # Storage (502) or DB (503) is down

# Every query is filtered by user_id: the DB role bypasses RLS (P-5).
CLAIM = (
    "update jobs set status = 'running', started_at = coalesce(started_at, now()), "
    "attempts = attempts + 1 where id = %s and status = 'queued' "
    "returning id, project_id, user_id"
)
FILES = (
    "select id, kind, page_index, original_path from project_files "
    "where project_id = %s and user_id = %s and status = 'uploaded' order by created_at"
)
VALID = (
    "update project_files set status = 'valid', error_code = null, width = %s, height = %s, "
    "derived_path = %s, thumb_path = %s where id = %s and user_id = %s"
)
INVALID = (
    "update project_files set status = 'invalid', error_code = %s where id = %s and user_id = %s"
)
REQUEUE = "update jobs set status = 'queued' where id = %s and user_id = %s and status = 'running'"
FINISH = (
    "update jobs set status = %s, error_code = %s, finished_at = now(), "
    "duration_ms = (extract(epoch from now() - started_at) * 1000)::int "
    "where id = %s and user_id = %s and status = 'running'"
)
UNFINISHED = (
    "select count(*) filter (where status <> 'valid') as bad from project_files "
    "where project_id = %s and user_id = %s"
)
SET_PROJECT = "update projects set status = %s where id = %s and user_id = %s"


@functools.cache
def _dependencies() -> tuple[Pool, ObjectStorage]:
    """Built on the first task, i.e. after the prefork: connections never cross a fork."""
    return create_pool(), create_storage()


def _max_bytes(kind: FileKind) -> int:
    limits = input_limits()
    return (limits.floor_plan if kind == "plan" else limits.photos).max_bytes


def _store(storage: ObjectStorage, row: dict[str, Any]) -> tuple[Any, ...] | IngestErrorCode:
    """Download, derive, upload. Returns the VALID params, or the file's error code."""
    kind: FileKind = row["kind"]
    original = storage.download(ORIGINALS, row["original_path"])
    if original is None:
        return IngestErrorCode.ORIGINAL_MISSING
    if len(original) > _max_bytes(kind):  # before any parsing
        return IngestErrorCode.FILE_TOO_LARGE
    try:
        derived = process_file(original, kind, row["page_index"] or 0)
    except IngestError as exc:
        return exc.code
    main = f"{row['original_path']}/main.{derived.extension}"
    thumb = f"{row['original_path']}/thumb.jpg"
    storage.upload(DERIVED, main, derived.main, f"image/{'png' if kind == 'plan' else 'jpeg'}")
    storage.upload(DERIVED, thumb, derived.thumb, "image/jpeg")
    return derived.width, derived.height, main, thumb


def _process_files(pool: Pool, storage: ObjectStorage, job: dict[str, Any]) -> None:
    with connection(pool) as conn:
        rows = conn.execute(FILES, (job["project_id"], job["user_id"])).fetchall()
    for row in rows:
        result = _store(storage, row)  # network and CPU: no connection held
        with connection(pool) as conn:
            if isinstance(result, IngestErrorCode):
                conn.execute(INVALID, (result.value, row["id"], job["user_id"]))
            else:
                conn.execute(VALID, (*result, row["id"], job["user_id"]))


def _finish(pool: Pool, job: dict[str, Any], status: str, error: str | None = None) -> None:
    with connection(pool) as conn:
        conn.execute(FINISH, (status, error, job["id"], job["user_id"]))
        if status == "done":
            args = (job["project_id"], job["user_id"])
            unfinished = conn.execute(UNFINISHED, args).fetchone()
            project = "needs_fix" if unfinished and unfinished["bad"] else "ready"
            conn.execute(SET_PROJECT, (project, *args))


def _give_up(pool: Pool, job: dict[str, Any] | None, error: str) -> None:
    if job is None:
        return
    try:
        _finish(pool, job, "failed", error)
    except TRANSIENT:  # nothing more to do: the stale job stays visible as running
        logger.error("could not mark job %s as failed", job["id"])


@celery_app.task(
    name="ingest", bind=True, max_retries=MAX_RETRIES,
    soft_time_limit=SOFT_TIME_LIMIT, time_limit=HARD_TIME_LIMIT,
)  # fmt: skip
def ingest(self: Task, job_id: str) -> None:
    pool, storage = _dependencies()
    job: dict[str, Any] | None = None
    try:
        with connection(pool) as conn:
            job = conn.execute(CLAIM, (job_id,)).fetchone()
        if job is None:  # claimed, finished or unknown: a duplicate message does nothing
            return
        _process_files(pool, storage, job)
        _finish(pool, job, "done")
    except TRANSIENT as exc:
        if self.request.retries >= MAX_RETRIES:
            _give_up(pool, job, "storage_unavailable")
            return
        if job:
            with connection(pool) as conn:  # so the retry can claim it again
                conn.execute(REQUEUE, (job["id"], job["user_id"]))
        raise self.retry(exc=exc, countdown=BACKOFF_SECONDS * 2**self.request.retries) from exc
    except SoftTimeLimitExceeded:
        _give_up(pool, job, "timeout")
    except Exception:
        _give_up(pool, job, "internal_error")
        raise
