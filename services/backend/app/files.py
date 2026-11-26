import logging
from functools import lru_cache
from pathlib import PurePath
from typing import Annotated, Literal
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Response
from psycopg.rows import DictRow
from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.auth import CurrentUserDep
from app.db import PoolDep, connection
from app.errors import ERROR_RESPONSES, ApiError, ErrorDetail
from app.limits import FileRule, InputLimits, load_input_limits
from app.ratelimit import FilesLimit
from app.storage import DERIVED, ORIGINALS, ObjectStorage, StorageDep
from app.validation import not_found, parse_id, printable

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["files"], responses=ERROR_RESPONSES)

MAX_BATCH = 11  # 1 plan + 10 photos
MB = 1024 * 1024
# Every query is filtered by user_id: the DB role bypasses RLS (P-5). `for update` serialises
# concurrent uploads/submits of one project, so the counts below cannot race.
EDITABLE_STATUSES = ("draft", "needs_fix")  # the only states where files may change
LOCK = "select id, status from projects where id = %s and user_id = %s for update"
COUNTS = (
    "select kind, count(*) as n from project_files "
    "where project_id = %s and user_id = %s group by kind"
)
INSERT = (
    "insert into project_files (id, project_id, user_id, kind, original_filename, declared_mime, "
    "size_bytes, original_path) values (%s, %s, %s, %s, %s, %s, %s, %s)"
)
SELECT_FILE = (
    "select id, original_path from project_files where id = %s and project_id = %s and user_id = %s"
)
DELETE = "delete from project_files where id = %s and project_id = %s and user_id = %s"
# Rows whose signing failed: they never got a URL, so no object can exist.
DELETE_PENDING = (
    "delete from project_files where id = any(%s) and project_id = %s and user_id = %s "
    "and status = 'pending'"
)


def _plain_name(value: str) -> str:
    if "/" in value or "\\" in value:
        raise ValueError("must not contain / or \\")
    return printable(value)


class FileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["plan", "photo"]
    filename: Annotated[str, Field(min_length=1, max_length=255), AfterValidator(_plain_name)]
    size: Annotated[int, Field(gt=0)]
    mime: Annotated[str, Field(max_length=100)]


class FilesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    files: Annotated[list[FileIn], Field(min_length=1, max_length=MAX_BATCH)]


class UploadTarget(BaseModel):
    file_id: UUID
    kind: Literal["plan", "photo"]
    mime: str
    upload_url: str  # PUT the raw bytes here with `headers`; the token is inside the URL
    headers: dict[str, str]


class UploadTargets(BaseModel):
    files: list[UploadTarget]


def lock_editable_project(
    conn: psycopg.Connection[DictRow], project_id: UUID, user_id: UUID
) -> None:
    row = conn.execute(LOCK, (project_id, user_id)).fetchone()
    if row is None:  # unknown and foreign look the same (anti-IDOR)
        raise not_found()
    if row["status"] not in EDITABLE_STATUSES:
        raise ApiError(
            409, "project_not_draft", "Files can only change before the project is sent."
        )


@lru_cache
def input_limits() -> InputLimits:
    return load_input_limits()


def _problem(item: FileIn, rule: FileRule) -> tuple[str, str] | None:
    name = item.filename
    if PurePath(name).suffix.lower() not in rule.extensions or item.mime not in rule.mime_types:
        heic = "heic" in name.lower() or "heic" in item.mime
        hint = "Export as JPG" if heic else f"Use one of: {', '.join(rule.extensions)}"
        return "unsupported_type", f"{name}: this file type is not supported. {hint}."
    if item.size > rule.max_bytes:
        return "too_large", (
            f"{name}: {item.size / MB:.1f} MB; the maximum is {rule.max_bytes // MB} MB. "
            "Reduce it or choose another file."
        )
    return None


def validate(items: list[FileIn], existing: dict[str, int]) -> list[ErrorDetail]:
    """One entry per rejected file."""
    limits = input_limits()
    rules = {"plan": limits.floor_plan, "photo": limits.photos}
    seen = dict(existing)
    errors: list[ErrorDetail] = []
    for index, item in enumerate(items):
        rule = rules[item.kind]
        seen[item.kind] = seen.get(item.kind, 0) + 1
        problem = _problem(item, rule)
        if problem is None and seen[item.kind] > rule.max_count:
            problem = (
                "too_many_files",
                f"{item.filename}: at most {rule.max_count} {item.kind}(s) per project. "
                "Remove one first.",
            )
        if problem:
            code, message = problem
            errors.append(
                ErrorDetail(index=index, filename=item.filename, code=code, message=message)
            )
    return errors


@router.post("/{project_id}/files", status_code=201)
def register_files(
    project_id: str,
    body: FilesIn,
    user: CurrentUserDep,
    pool: PoolDep,
    storage: StorageDep,
    _limit: FilesLimit,
) -> UploadTargets:
    project_uuid = parse_id(project_id)
    planned = [(uuid4(), item) for item in body.files]
    with connection(pool) as conn:  # validate and insert under the lock; no network in here
        lock_editable_project(conn, project_uuid, user.id)
        counts = conn.execute(COUNTS, (project_uuid, user.id)).fetchall()
        errors = validate(body.files, {row["kind"]: row["n"] for row in counts})
        if errors:
            raise ApiError(422, "invalid_files", "Some files cannot be added.", details=errors)
        for file_id, item in planned:
            path = f"{user.id}/{project_uuid}/{file_id}"  # never the user's file name
            row = (file_id, project_uuid, user.id, item.kind, item.filename, item.mime, item.size)
            conn.execute(INSERT, (*row, path))
    try:
        targets = [
            UploadTarget(
                file_id=file_id,
                kind=item.kind,
                mime=item.mime,
                upload_url=storage.signed_upload_url(f"{user.id}/{project_uuid}/{file_id}"),
                headers={"Content-Type": item.mime},
            )
            for file_id, item in planned
        ]
    except ApiError:
        with connection(pool) as conn:  # nothing was handed out: drop the rows to free the slots
            conn.execute(
                DELETE_PENDING, ([file_id for file_id, _ in planned], project_uuid, user.id)
            )
        raise
    return UploadTargets(files=targets)


def _owned_path(path: str, user_id: UUID, project_id: UUID) -> str:
    """Storage deletes by path: refuse anything outside this user's and project's prefix."""
    if not path.startswith(f"{user_id}/{project_id}/") or path.endswith("/"):
        logger.error("refusing to delete a path outside the project prefix")
        raise ApiError(500, "internal_error", "Something went wrong.")
    return path


def _remove_objects(storage: ObjectStorage, path: str) -> None:
    # shortcut: best effort. An orphaned object is harmless (private bucket, unreachable path);
    # a periodic sweep of objects without a row would reclaim the space.
    try:
        storage.delete(ORIGINALS, [path])
        storage.delete_prefix(DERIVED, path)
    except ApiError:
        logger.warning("orphaned storage objects left behind: %s", path)


@router.delete("/{project_id}/files/{file_id}", status_code=204)
def delete_file(
    project_id: str,
    file_id: str,
    user: CurrentUserDep,
    pool: PoolDep,
    storage: StorageDep,
    _limit: FilesLimit,
) -> Response:
    project_uuid, file_uuid = parse_id(project_id), parse_id(file_id, "File")
    with connection(pool) as conn:
        lock_editable_project(conn, project_uuid, user.id)
        row = conn.execute(SELECT_FILE, (file_uuid, project_uuid, user.id)).fetchone()
        if row is None:
            raise not_found("File")
        path = _owned_path(row["original_path"], user.id, project_uuid)
        conn.execute(DELETE, (file_uuid, project_uuid, user.id))
    _remove_objects(storage, path)
    return Response(status_code=204)
