import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

import psycopg
from fastapi import APIRouter
from psycopg.rows import DictRow
from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.auth import CurrentUserDep
from app.db import Pool, PoolDep, connection
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail
from app.files import EDITABLE_STATUSES, LOCK, input_limits
from app.ratelimit import SubmitLimit
from app.settings import Settings, get_settings
from app.storage import ObjectStorage, StorageDep
from app.validation import not_found, parse_id, printable
from app.worker import celery_app, configure_celery
from app.worker.limits import STALE_RUNNING_SECONDS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["submit"], responses=ERROR_RESPONSES)

DESCRIPTION_MAX_CHARS = 2000  # mirrors shared/input-limits.json and the column check
AREA_MAX_M2 = 100_000  # a sanity cap, far above any home
STALE_QUEUED_SECONDS = 60  # a queued job older than this lost its message (broker hiccup)
BROKER_TIMEOUT_SECONDS = 3
# Every query is filtered by user_id: the DB role bypasses RLS (P-5).
ACTIVE_JOB = (
    "select id, project_id, status, created_at, "
    f"(status = 'queued' and created_at < now() - interval '{STALE_QUEUED_SECONDS} seconds') "
    "or (status = 'running' and claimed_at < "
    f"now() - make_interval(secs => {STALE_RUNNING_SECONDS})) "
    "as stale from jobs where project_id = %s and user_id = %s "
    "and type = 'ingest' and status in ('queued', 'running') limit 1"
)
FILES = (
    "select id, kind, size_bytes, original_path, original_filename, status from project_files "
    "where project_id = %s and user_id = %s"
)
MARK = (
    "update project_files set status = 'uploaded' "
    "where id = %s and project_id = %s and user_id = %s"
)
PAGE = (
    "update project_files set page_index = %s where project_id = %s and user_id = %s "
    "and status = 'uploaded' "
    "and kind = 'plan'"
)
# coalesce: details not sent now keep what an earlier attempt saved.
SAVE_PROJECT = (
    "update projects set area_m2 = coalesce(%s, area_m2), "
    "description = coalesce(%s, description), status = 'ingesting' where id = %s and user_id = %s"
)
INSERT_JOB = (
    "insert into jobs (project_id, user_id, type) values (%s, %s, 'ingest') "
    "returning id, project_id, status, created_at"
)
FAIL_JOB = (
    "update jobs set status = 'failed', error_code = 'enqueue_failed', finished_at = now() "
    "where id = %s and user_id = %s and status = 'queued'"
)
REOPEN = "update projects set status = %s where id = %s and user_id = %s and status = 'ingesting'"


def _note(value: str) -> str:
    return printable(value, allow="\n\r\t")


class SubmitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_page_index: Annotated[
        int | None,
        Field(
            ge=0,
            description="PDF page to use as the plan (the ingest checks the real count). "
            "Ignored if the plan is already valid: replace the plan to change its page.",
        ),
    ] = None
    area_m2: Annotated[float | None, Field(gt=0, le=AREA_MAX_M2, allow_inf_nan=False)] = None
    description: (
        Annotated[str, Field(max_length=DESCRIPTION_MAX_CHARS), AfterValidator(_note)] | None
    ) = None


class Job(BaseModel):
    id: UUID
    project_id: UUID
    status: Literal["queued", "running", "done", "failed"]
    created_at: datetime


@dataclass(frozen=True)
class Outcome:
    job: Job
    created: bool  # a new job: if the broker refuses it, release the project
    send: bool  # (re)send the message
    reopen_to: str = "draft"  # where the project goes back if the broker refuses a new job


def configure_publisher(settings: Settings | None = None) -> None:
    """Broker setup for the API process: a dead Redis must fail fast, not hold a thread."""
    configure_celery(settings or get_settings())
    celery_app.conf.broker_connection_timeout = BROKER_TIMEOUT_SECONDS
    celery_app.conf.broker_transport_options = {
        **celery_app.conf.broker_transport_options,  # keeps the worker's visibility_timeout
        "socket_timeout": BROKER_TIMEOUT_SECONDS,
        "socket_connect_timeout": BROKER_TIMEOUT_SECONDS,
    }
    celery_app.conf.task_publish_retry_policy = {"max_retries": 1, "interval_max": 0.2}


def enqueue_ingest(job_id: UUID) -> None:
    celery_app.send_task("ingest", args=[str(job_id)])


def _detail(code: str, message: str, file_id: str | None = None) -> ErrorDetail:
    return ErrorDetail(code=code, message=message, file_id=file_id)


def _check_counts(rows: list[dict[str, Any]]) -> list[ErrorDetail]:
    plans = sum(r["kind"] == "plan" for r in rows)
    photos = len(rows) - plans
    minimum = input_limits().photos.min_count
    errors = []
    if plans == 0:
        errors.append(_detail("missing_plan", "Add the floor plan before sending."))
    if plans > 1:
        errors.append(
            _detail("too_many_plans", "Only one floor plan per project: remove the rest.")
        )
    if photos < minimum:
        errors.append(
            _detail("too_few_photos", f"Add at least {minimum} photos ({photos} so far).")
        )
    return errors


def _check_invalid(rows: list[dict[str, Any]]) -> list[ErrorDetail]:
    return [
        _detail(
            "invalid_file",
            f"Replace or remove {row['original_filename']} before sending again.",
            str(row["id"]),
        )
        for row in rows
        if row["status"] == "invalid"
    ]


def _check_objects(rows: list[dict[str, Any]], storage: ObjectStorage) -> list[ErrorDetail]:
    errors = []
    for row in rows:
        if row["status"] != "pending":
            continue
        real = storage.size(row["original_path"])
        file_id = str(row["id"])
        if real is None:
            errors.append(
                _detail("missing_object", "The file was not uploaded. Upload it again.", file_id)
            )
        elif real != row["size_bytes"]:
            message = (
                "The uploaded size differs from the declared one. Remove it and upload it again."
            )
            errors.append(_detail("size_mismatch", message, file_id))
    return errors


def _lock_and_find_job(
    conn: psycopg.Connection[DictRow], project_id: UUID, user_id: UUID
) -> tuple[str, Outcome | None]:
    """Lock the project. An active job wins (idempotent submit); otherwise it must be editable.
    Returns the project status too, so a refused broker can put it back where it was."""
    project = conn.execute(LOCK, (project_id, user_id)).fetchone()
    if project is None:
        raise not_found()
    active = conn.execute(ACTIVE_JOB, (project_id, user_id)).fetchone()
    if active:
        outcome = Outcome(Job.model_validate(active), created=False, send=bool(active.get("stale")))
        return project["status"], outcome
    if project["status"] not in EDITABLE_STATUSES:
        raise ApiError(
            409, "project_not_editable", "This project can't be sent in its current state."
        )
    return project["status"], None


def _fingerprint(rows: list[dict[str, Any]]) -> frozenset[tuple[Any, ...]]:
    return frozenset((r["id"], r["status"], r["size_bytes"]) for r in rows)


def _create_job(
    pool: Pool,
    project_id: UUID,
    user_id: UUID,
    body: SubmitIn,
    seen: list[dict[str, Any]],
) -> Outcome:
    with connection(pool) as conn:
        status, found = _lock_and_find_job(conn, project_id, user_id)  # a concurrent submit may win
        if found:
            return found
        rows = conn.execute(FILES, (project_id, user_id)).fetchall()
        if _fingerprint(rows) != _fingerprint(seen):  # storage was checked without the lock
            raise ApiError(409, "files_changed", "The files changed while sending. Try again.")
        for row in rows:
            if row["status"] != "pending":  # valid files keep their derivatives
                continue
            conn.execute(MARK, (row["id"], project_id, user_id))
        if body.plan_page_index is not None:
            conn.execute(PAGE, (body.plan_page_index, project_id, user_id))
        conn.execute(SAVE_PROJECT, (body.area_m2, body.description, project_id, user_id))
        job = conn.execute(INSERT_JOB, (project_id, user_id)).fetchone()
        return Outcome(Job.model_validate(job), created=True, send=True, reopen_to=status)


def send_job(job: Job) -> None:
    try:
        enqueue_ingest(job.id)
    except Exception as exc:
        logger.error("enqueue failed for job %s: %s", job.id, type(exc).__name__)
        raise ApiError(
            503, "enqueue_failed", "Could not queue the job. Try again shortly."
        ) from exc


def _release(pool: Pool, job: Job, user_id: UUID, reopen_to: str) -> None:
    """The job was committed before sending (so the worker always finds it). The broker refused:
    fail the job and reopen the project, so the user can submit again."""
    with connection(pool) as conn:
        conn.execute(FAIL_JOB, (job.id, user_id))
        conn.execute(REOPEN, (reopen_to, job.project_id, user_id))


@router.post("/{project_id}/submit", status_code=202)
def submit(
    project_id: str,
    body: SubmitIn,
    user: CurrentUserDep,
    pool: PoolDep,
    storage: StorageDep,
    _limit: SubmitLimit,
) -> Job:
    project_uuid = parse_id(project_id)
    with connection(pool) as conn:  # short read: no network while a connection is held
        _, outcome = _lock_and_find_job(conn, project_uuid, user.id)
        rows = [] if outcome else conn.execute(FILES, (project_uuid, user.id)).fetchall()
    if outcome is None:
        errors = _check_invalid(rows) or _check_counts(rows) or _check_objects(rows, storage)
        if errors:
            raise ApiError(
                422, "invalid_files", "The project is not ready to send.", details=errors
            )
        outcome = _create_job(pool, project_uuid, user.id, body, rows)
    if outcome.send:
        try:
            send_job(outcome.job)
        except ApiError:
            if outcome.created:
                _release(pool, outcome.job, user.id, outcome.reopen_to)
            raise
    return outcome.job
