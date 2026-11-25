import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from celery.exceptions import Retry

import app.worker.ingest as job_module
from app.errors import ApiError
from app.ingest import IngestError, IngestErrorCode
from app.ingest.sandbox import Derived
from tests.fakes import FakePool, FakeStorage

JOB, PROJECT, USER_ID = (str(uuid.uuid4()) for _ in range(3))
FILE = str(uuid.uuid4())
PATH = f"{USER_ID}/{PROJECT}/{FILE}"
CLAIMED = [{"id": JOB, "project_id": PROJECT, "user_id": USER_ID}]
ROW = {"id": FILE, "kind": "photo", "page_index": None, "original_path": PATH, "size_bytes": 4}
DERIVED = Derived(b"main", b"thumb", 20, 10, "jpg")


class Env:
    def __init__(self) -> None:
        self.pool = FakePool()
        self.storage = FakeStorage(self.pool)
        self.processed: list[tuple[str, int]] = []
        self.outcome: Derived | Exception = DERIVED
        self.pool.on("set status = 'running'", CLAIMED)
        self.pool.on("status = 'uploaded'", [ROW])
        self.pool.on("count(*)", [{"bad": 0}])
        self.storage.objects[("originals", PATH)] = b"orig"


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> Iterator[Env]:
    state = Env()

    def fake_process(data: bytes, kind: str, page_index: int) -> Derived:
        state.processed.append((kind, page_index))
        if isinstance(state.outcome, Exception):
            raise state.outcome
        return state.outcome

    monkeypatch.setattr(job_module, "process_file", fake_process)
    monkeypatch.setattr(job_module, "_dependencies", lambda: (state.pool, state.storage))
    yield state


def run(job_id: str = JOB) -> Any:
    return job_module.ingest.apply(args=[job_id])


def test_a_job_that_is_not_queued_is_left_alone(env: Env) -> None:
    env.pool.answers.clear()
    env.pool.on("status = 'uploaded'", [ROW])

    run()

    assert env.processed == [] and not env.pool.ran("finished_at")


def test_valid_file_gets_derivatives_uploaded_and_recorded(env: Env) -> None:
    run()

    assert env.storage.objects[("derived", f"{PATH}/main.jpg")] == b"main"
    assert env.storage.objects[("derived", f"{PATH}/thumb.jpg")] == b"thumb"
    saved = env.pool.ran("set status = 'valid'")
    assert saved == [(20, 10, f"{PATH}/main.jpg", f"{PATH}/thumb.jpg", FILE, USER_ID)]
    assert env.pool.ran("update jobs set status = %s")[0][:2] == ("done", None)
    assert env.pool.ran("update projects set status")[0][0] == "ready"


def test_a_plan_is_rendered_from_its_page(env: Env) -> None:
    env.pool.answers[1] = ("status = 'uploaded'", [{**ROW, "kind": "plan", "page_index": 2}])

    run()

    assert env.processed == [("plan", 2)]


def test_validation_error_marks_the_file_invalid_and_the_project_needs_fix(env: Env) -> None:
    env.outcome = IngestError(IngestErrorCode.PDF_ENCRYPTED)
    env.pool.answers[2] = ("count(*)", [{"bad": 1}])

    run()

    assert env.pool.ran("set status = 'invalid'") == [("pdf_encrypted", FILE, USER_ID)]
    assert env.pool.ran("update jobs set status = %s")[0][:2] == ("done", None)
    assert env.pool.ran("update projects set status")[0][0] == "needs_fix"


@pytest.mark.parametrize(
    ("objects", "code"),
    [({}, "original_missing"), ({("originals", PATH): b"x" * (13 * 1024**2)}, "file_too_large")],
)
def test_missing_or_oversized_original_is_invalid_without_processing(
    env: Env, objects: dict[tuple[str, str], bytes], code: str
) -> None:
    env.storage.objects = objects

    run()

    assert env.processed == []
    assert env.pool.ran("set status = 'invalid'")[0][0] == code


def test_transient_storage_error_requeues_the_job_and_retries(env: Env) -> None:
    env.storage.upload_errors = [ApiError(502, "storage_unavailable", "down")]

    result = run()

    assert env.pool.ran("set status = 'queued'")  # the claim can win again
    assert result.successful()  # eager retry ran the second attempt
    assert env.pool.ran("update jobs set status = %s")[0][:2] == ("done", None)


def test_retries_are_exhausted_then_the_job_fails(env: Env) -> None:
    env.storage.upload_errors = [ApiError(502, "storage_unavailable", "down")] * 10

    run()

    assert env.pool.ran("update jobs set status = %s")[-1][:2] == ("failed", "storage_unavailable")


def test_unexpected_error_fails_the_job_and_is_not_retried(env: Env) -> None:
    env.outcome = RuntimeError("bug")

    result = run()

    assert result.failed()
    assert env.pool.ran("update jobs set status = %s")[-1][:2] == ("failed", "internal_error")
    assert Retry not in {type(result.result)}
