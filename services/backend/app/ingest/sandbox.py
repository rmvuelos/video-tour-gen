"""Runs the ingest of ONE file in a child process with hard limits.

pdfium is C code that Python cannot interrupt, and a hostile file can eat memory, CPU, disk or
processes. The child sets RLIMIT_AS/CPU/FSIZE/NPROC/NOFILE on itself, runs in its own session in
an empty temp dir with a minimal environment, and its stdout/stderr are files capped by FSIZE.
The parent adds a wall-clock timeout and kills the whole process group.
Child output: see wire.py. A child that dies, hangs or runs out of memory is the file's fault
(`too_large_pixels`, no retry); a child that fails without a frame is OUR bug (RuntimeError).

shortcut: same uid as the worker and network access remain; run the child in its own container
(no network, other uid) at deploy time.
"""

import contextlib
import ctypes
import logging
import os
import signal
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from app.ingest.errors import IngestError, IngestErrorCode
from app.ingest.media import FileKind
from app.ingest.wire import Derived, decode

__all__ = ["Derived", "Limits", "process_file"]

logger = logging.getLogger(__name__)
MiB = 1024 * 1024
BACKEND_ROOT = Path(__file__).resolve().parents[2]
CHILD_ENV = ("PATH", "INPUT_LIMITS_PATH")  # nothing else: no secrets reach the file's parser
LIMIT_SIGNALS = (signal.SIGKILL, signal.SIGXCPU, signal.SIGXFSZ)  # OOM kill, CPU, output size
STDERR_TAIL = 500
PR_SET_DUMPABLE = 4


@dataclass(frozen=True, slots=True)
class Limits:
    memory_bytes: int = 2048 * MiB  # a 64 MP RGB decode is ~190 MB; the rest is interpreter slack
    cpu_seconds: int = 30
    wall_seconds: float = 60  # also covers a child blocked without using CPU


@cache
def _harden_parent() -> None:
    """Not dumpable: a same-uid child cannot read this process's memory through /proc."""
    try:
        ctypes.CDLL(None).prctl(PR_SET_DUMPABLE, 0, 0, 0, 0)
    except (OSError, AttributeError):  # not Linux: the Docker worker is
        logger.warning("could not clear the dumpable flag")


def _kill_group(proc: subprocess.Popen[bytes]) -> None:
    with contextlib.suppress(ProcessLookupError):
        os.killpg(proc.pid, signal.SIGKILL)
    proc.wait()


def process_file(
    data: bytes, kind: FileKind, page_index: int, limits: Limits = Limits()
) -> Derived:
    """Derivatives of one file. Raises IngestError (validation, or the child blew a limit)."""
    _harden_parent()
    command = [
        sys.executable, "-m", "app.ingest.child", kind, str(page_index),
        str(limits.memory_bytes), str(limits.cpu_seconds),
    ]  # fmt: skip
    env = {name: os.environ[name] for name in CHILD_ENV if name in os.environ}
    env["PYTHONPATH"] = str(BACKEND_ROOT)
    with tempfile.TemporaryDirectory(prefix="ingest-") as work:
        out_path, err_path = Path(work, "out"), Path(work, "err")
        with out_path.open("wb") as out, err_path.open("wb") as err:
            proc = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
                command, stdin=subprocess.PIPE, stdout=out, stderr=err,
                cwd=work, env=env, start_new_session=True,
            )  # fmt: skip
            try:
                proc.communicate(data, timeout=limits.wall_seconds)
            except subprocess.TimeoutExpired:
                logger.warning("ingest child timed out after %ss", limits.wall_seconds)
                _kill_group(proc)
                raise IngestError(IngestErrorCode.TOO_LARGE_PIXELS) from None
            except BaseException:  # e.g. the task's soft time limit: leave nothing running
                _kill_group(proc)
                raise
        return _interpret(proc.returncode, out_path.read_bytes(), err_path.read_bytes())


def _interpret(returncode: int, out: bytes, err: bytes) -> Derived:
    if returncode < 0 and -returncode in LIMIT_SIGNALS:
        logger.warning("ingest child stopped by %s", signal.Signals(-returncode).name)
        raise IngestError(IngestErrorCode.TOO_LARGE_PIXELS)
    if returncode < 0:  # SIGSEGV and friends: the parser crashed on this file
        logger.warning("ingest child crashed with signal %s", -returncode)
        raise IngestError(IngestErrorCode.CORRUPT_FILE)
    try:
        return decode(out)
    except IngestError:
        raise
    except (ValueError, KeyError, TypeError):  # no valid frame: the child itself is broken
        tail = err[-STDERR_TAIL:].decode(errors="replace")
        logger.error("ingest child failed: returncode=%s stderr=%s", returncode, tail)
        raise RuntimeError("ingest child produced no valid result") from None
