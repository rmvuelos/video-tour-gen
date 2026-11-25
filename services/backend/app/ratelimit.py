import math
import threading
import time
from collections import deque
from collections.abc import Callable
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.auth import CurrentUserDep
from app.errors import ApiError

WINDOW_SECONDS = 60
FILES_PER_WINDOW = 30
SUBMITS_PER_WINDOW = 10


class RateLimiter:
    """Sliding window per (user, scope)."""

    # shortcut: counters live in this process's memory, so N workers or replicas allow N times
    # the limit; move them to Redis once the API runs with several workers or replicas.
    def __init__(
        self, limit: int, window_seconds: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._limit = limit
        self._window = window_seconds
        self._clock = clock
        self._lock = threading.Lock()  # sync endpoints run in a thread pool
        self._hits: dict[tuple[str, str], deque[float]] = {}

    def __len__(self) -> int:
        return len(self._hits)

    def hit(self, user: str, scope: str) -> None:
        key = (user, scope)
        with self._lock:
            now = self._clock()
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self._window:
                hits.popleft()
            if len(hits) >= self._limit:
                retry_after = math.ceil(hits[0] + self._window - now)
                raise ApiError(
                    429,
                    "rate_limited",
                    "Too many requests. Wait a moment and try again.",
                    {"Retry-After": str(retry_after)},
                )
            hits.append(now)
            self._prune(now)

    def _prune(self, now: float) -> None:
        """Forget idle users so the table does not grow without bound."""
        for key in [k for k, h in self._hits.items() if not h or h[-1] <= now - self._window]:
            del self._hits[key]


@lru_cache
def files_limiter() -> RateLimiter:
    return RateLimiter(FILES_PER_WINDOW, WINDOW_SECONDS)


@lru_cache
def submit_limiter() -> RateLimiter:
    return RateLimiter(SUBMITS_PER_WINDOW, WINDOW_SECONDS)


def _guard(provider: Callable[[], RateLimiter], scope: str) -> Callable[..., None]:
    def check(user: CurrentUserDep, limiter: Annotated[RateLimiter, Depends(provider)]) -> None:
        limiter.hit(str(user.id), scope)

    return check


FilesLimit = Annotated[None, Depends(_guard(files_limiter, "files"))]
SubmitLimit = Annotated[None, Depends(_guard(submit_limiter, "submit"))]
