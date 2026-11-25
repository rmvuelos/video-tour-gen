from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

import psycopg
from fastapi import APIRouter, Query
from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

from app.auth import CurrentUserDep, unauthorized
from app.db import PoolDep, connection
from app.errors import ERROR_RESPONSES
from app.validation import not_found, parse_id, printable

router = APIRouter(prefix="/projects", tags=["projects"], responses=ERROR_RESPONSES)

# Every query is parameterised and filtered by user_id: the DB role bypasses RLS (P-5).
COLUMNS = "id, name, status, area_m2, description, created_at, updated_at"
INSERT = f"insert into projects (user_id, name) values (%s, %s) returning {COLUMNS}"
# shortcut: offset pagination, fine for tens of projects per user; use keyset on (created_at, id)
# when users have many.
LIST = (
    f"select {COLUMNS} from projects where user_id = %s "
    "order by created_at desc, id desc limit %s offset %s"
)
SELECT_ONE = f"select {COLUMNS} from projects where id = %s and user_id = %s"


class ProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
        AfterValidator(printable),
    ]


class Project(BaseModel):
    id: UUID
    name: str
    status: Literal["draft", "ingesting", "ready", "needs_fix"]
    area_m2: float | None  # m2 needs no decimal precision; Decimal would serialise as a string
    description: str | None
    created_at: datetime
    updated_at: datetime


class ProjectPage(BaseModel):
    items: list[Project]
    limit: int
    offset: int


@router.post("", status_code=201)
def create_project(body: ProjectIn, user: CurrentUserDep, pool: PoolDep) -> Project:
    with connection(pool) as conn:
        try:
            row = conn.execute(INSERT, (user.id, body.name)).fetchone()
        except psycopg.errors.ForeignKeyViolation:  # user deleted, token still valid
            raise unauthorized() from None
    return Project.model_validate(row)


@router.get("")
def list_projects(
    user: CurrentUserDep,
    pool: PoolDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> ProjectPage:
    with connection(pool) as conn:
        rows = conn.execute(LIST, (user.id, limit, offset)).fetchall()
    return ProjectPage(items=[Project.model_validate(r) for r in rows], limit=limit, offset=offset)


@router.get("/{project_id}")
def get_project(project_id: str, user: CurrentUserDep, pool: PoolDep) -> Project:
    project_uuid = parse_id(project_id)
    with connection(pool) as conn:
        row = conn.execute(SELECT_ONE, (project_uuid, user.id)).fetchone()
    if row is None:  # unknown and foreign look the same (anti-IDOR)
        raise not_found()
    return Project.model_validate(row)
