from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import CurrentUserDep
from app.db import PoolDep, connection
from app.errors import ERROR_RESPONSES, ApiError
from app.files import LOCK
from app.ratelimit import ReadLimit, SubmitLimit
from app.submit import FAIL_JOB, INSERT_JOB, Job, send_job
from app.validation import not_found, parse_id
from app.worker.limits import STALE_RUNNING_SECONDS

router = APIRouter(prefix="/projects", tags=["jobs"], responses=ERROR_RESPONSES)

# Every query is filtered by user_id: the DB role bypasses RLS (P-5). A foreign project has no
# rows, so it answers like an unknown one (anti-IDOR).
LATEST = (
    "select id, project_id, status, error_code, attempts, created_at, started_at, finished_at, "
    "duration_ms, (status = 'running' and claimed_at < "
    f"now() - make_interval(secs => {STALE_RUNNING_SECONDS})) as stale "
    "from jobs where project_id = %s and user_id = %s and type = 'ingest' "
    "order by created_at desc, id desc limit 1"
)
# The worker lost this job (see worker.ingest.RECLAIMABLE): free the project's one active slot.
ABANDON = (
    "update jobs set status = 'failed', error_code = 'worker_lost', finished_at = now() "
    "where id = %s and user_id = %s and status = 'running'"
)
FILES = (
    "select id, kind, status, error_code, width, height from project_files "
    "where project_id = %s and user_id = %s "
    "order by (kind = 'plan') desc, created_at, id"
)


class FileState(BaseModel):
    id: UUID
    kind: Literal["plan", "photo"]
    status: Literal["pending", "uploaded", "valid", "invalid"]
    error_code: str | None
    width: int | None
    height: int | None


class JobState(BaseModel):
    id: UUID
    project_id: UUID
    status: Literal["queued", "running", "done", "failed"]
    error_code: str | None
    attempts: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None
    files: list[FileState]


@router.get("/{project_id}/jobs/latest")
def latest_job(project_id: str, user: CurrentUserDep, pool: PoolDep, _limit: ReadLimit) -> JobState:
    project_uuid = parse_id(project_id)
    with connection(pool) as conn:
        job = conn.execute(LATEST, (project_uuid, user.id)).fetchone()
        if job is None:
            raise not_found("Job")
        files = conn.execute(FILES, (project_uuid, user.id)).fetchall()
    return JobState.model_validate({**job, "files": files})


@router.post("/{project_id}/jobs/ingest/retry", status_code=202)
def retry_ingest(project_id: str, user: CurrentUserDep, pool: PoolDep, _limit: SubmitLimit) -> Job:
    project_uuid = parse_id(project_id)
    with connection(pool) as conn:  # the lock serialises double clicks: the second sees `queued`
        project = conn.execute(LOCK, (project_uuid, user.id)).fetchone()
        if project is None:
            raise not_found()
        last = conn.execute(LATEST, (project_uuid, user.id)).fetchone()
        lost = last is not None and last["status"] == "running" and last["stale"]
        if (
            project["status"] != "ingesting"
            or last is None
            or not (lost or last["status"] == "failed")
        ):
            raise ApiError(409, "job_not_failed", "There is no failed job to retry.")
        if lost:
            conn.execute(ABANDON, (last["id"], user.id))
        job = Job.model_validate(conn.execute(INSERT_JOB, (project_uuid, user.id)).fetchone())
    try:
        send_job(job)
    except ApiError:
        with connection(pool) as conn:  # the project stays `ingesting`: the user can retry again
            conn.execute(FAIL_JOB, (job.id, user.id))
        raise
    return job
