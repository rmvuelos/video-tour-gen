import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from app.auth import CurrentUser

USER = CurrentUser(id=uuid.uuid4(), email="ana@example.test")
PROJECT_ID = uuid.uuid4()


class FakePool:
    """Answers each SQL with the rows registered for the first matching fragment; records calls."""

    def __init__(self) -> None:
        self.answers: list[tuple[str, list[dict[str, Any]]]] = []
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self._last: list[dict[str, Any]] = []
        self.open_connections = 0

    def on(self, fragment: str, rows: list[dict[str, Any]]) -> None:
        self.answers.append((fragment, rows))

    def ran(self, fragment: str) -> list[tuple[Any, ...]]:
        return [params for sql, params in self.calls if fragment in sql]

    @contextmanager
    def connection(self, timeout: float | None = None) -> Iterator["FakePool"]:
        self.open_connections += 1
        try:
            yield self
        finally:
            self.open_connections -= 1

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> "FakePool":
        self.calls.append((sql, params))
        self._last = next((rows for fragment, rows in self.answers if fragment in sql), [])
        return self

    def fetchone(self) -> dict[str, Any] | None:
        return self._last[0] if self._last else None

    def fetchall(self) -> list[dict[str, Any]]:
        return self._last


class FakeStorage:
    def __init__(self, pool: FakePool | None = None) -> None:
        self.pool = pool
        self.calls_in_transaction: list[str] = []  # network calls made while a connection is open
        self.sign_error: Exception | None = None
        self.delete_error: Exception | None = None
        self.signed: list[str] = []
        self.deleted: list[tuple[str, list[str]]] = []
        self.prefixes: list[tuple[str, str]] = []

    def _note(self, call: str) -> None:
        if self.pool and self.pool.open_connections:
            self.calls_in_transaction.append(call)

    def signed_upload_url(self, path: str) -> str:
        self._note("sign")
        if self.sign_error:
            raise self.sign_error
        self.signed.append(path)
        return f"http://public.test/upload/{path}?token=t"

    def delete(self, bucket: str, paths: list[str]) -> None:
        self._note("delete")
        if self.delete_error:
            raise self.delete_error
        self.deleted.append((bucket, paths))

    def delete_prefix(self, bucket: str, prefix: str) -> None:
        self.prefixes.append((bucket, prefix))
