from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated, Any

import psycopg
from fastapi import Depends, Request
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from app.errors import ApiError
from app.settings import get_settings

CONNECT_TIMEOUT_SECONDS = 3


def create_pool() -> ConnectionPool[Any]:
    """Call from the lifespan, never at import. open() does not wait: a down DB is a 503 later."""
    url = get_settings().database_url.get_secret_value()
    pool: ConnectionPool[Any] = ConnectionPool(
        url, min_size=1, max_size=10, open=False, kwargs={"row_factory": dict_row}
    )
    pool.open(wait=False)
    return pool


def get_pool(request: Request) -> ConnectionPool[Any]:
    pool: ConnectionPool[Any] = request.app.state.pool
    return pool


PoolDep = Annotated[ConnectionPool[Any], Depends(get_pool)]


@contextmanager
def connection(pool: ConnectionPool[Any]) -> Iterator[psycopg.Connection[Any]]:
    """A pooled connection (one transaction). Unreachable DB is 503; other errors become 500."""
    try:
        with pool.connection(timeout=CONNECT_TIMEOUT_SECONDS) as conn:
            yield conn
    except (PoolTimeout, psycopg.OperationalError) as exc:
        raise ApiError(503, "db_unavailable", "The database is temporarily unavailable.") from exc
