import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

import psycopg
from fastapi import Depends, Request
from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool, PoolClosed

from app.errors import ApiError
from app.settings import get_settings

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT_SECONDS = 3
STATEMENT_TIMEOUT_MS = 5000

Pool = ConnectionPool[psycopg.Connection[DictRow]]


def create_pool() -> Pool:
    """Call from the lifespan, never at import. open() does not wait: a down DB is a 503 later."""
    url = get_settings().database_url.get_secret_value()
    pool: Pool = ConnectionPool(
        url,
        min_size=1,
        max_size=10,
        open=False,
        kwargs={
            "row_factory": dict_row,
            "connect_timeout": CONNECT_TIMEOUT_SECONDS,
            "options": f"-c statement_timeout={STATEMENT_TIMEOUT_MS}",
        },
    )
    pool.open(wait=False)
    return pool


def get_pool(request: Request) -> Pool:
    pool: Pool = request.app.state.pool
    return pool


PoolDep = Annotated[Pool, Depends(get_pool)]


@contextmanager
def connection(pool: Pool) -> Iterator[psycopg.Connection[DictRow]]:
    """A pooled connection (one transaction). Unreachable DB is 503; other errors become 500."""
    try:
        with pool.connection(timeout=CONNECT_TIMEOUT_SECONDS) as conn:
            yield conn
    except (psycopg.OperationalError, PoolClosed) as exc:  # PoolTimeout is an OperationalError
        logger.warning("db unavailable: %s", type(exc).__name__)
        raise ApiError(503, "db_unavailable", "The database is temporarily unavailable.") from exc
