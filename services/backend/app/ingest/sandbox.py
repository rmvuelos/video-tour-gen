"""Runs the ingest of ONE file in a child process with hard limits.

pdfium is C code that Python cannot interrupt, and a hostile file can eat memory or CPU. The
child sets RLIMIT_AS and RLIMIT_CPU on itself; the parent adds a wall-clock timeout and kills it.
Wire format on the child's stdout: 4-byte big-endian JSON length, the JSON, main bytes, thumb bytes.
A child that dies, hangs or runs out of memory is the file's fault: `too_large_pixels`, no retry.
"""

import json
import os
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from app.ingest.errors import IngestError, IngestErrorCode
from app.ingest.media import FileKind

MiB = 1024 * 1024
BACKEND_ROOT = Path(__file__).resolve().parents[2]
CHILD_ENV = ("PATH", "INPUT_LIMITS_PATH")  # nothing else: no secrets reach the file's parser
_HEADER = struct.Struct(">I")


@dataclass(frozen=True, slots=True)
class Limits:
    memory_bytes: int = 2048 * MiB  # a 64 MP RGB decode is ~190 MB; the rest is interpreter slack
    cpu_seconds: int = 30
    wall_seconds: float = 60  # also covers a child blocked without using CPU


@dataclass(frozen=True, slots=True)
class Derived:
    main: bytes
    thumb: bytes
    width: int
    height: int
    extension: str  # "jpg" for photos, "png" for plans; the thumbnail is always a JPEG


def process_file(
    data: bytes, kind: FileKind, page_index: int, limits: Limits = Limits()
) -> Derived:
    """Derivatives of one file. Raises IngestError (validation, or the child blew a limit)."""
    command = [
        sys.executable, "-m", "app.ingest.child", kind, str(page_index),
        str(limits.memory_bytes), str(limits.cpu_seconds),
    ]  # fmt: skip
    env = {name: os.environ[name] for name in CHILD_ENV if name in os.environ}
    try:
        done = subprocess.run(  # noqa: S603 - fixed argv, no shell
            command, input=data, capture_output=True, timeout=limits.wall_seconds,
            cwd=BACKEND_ROOT, env=env, check=False,
        )  # fmt: skip
    except subprocess.TimeoutExpired:  # run() kills the child before raising
        raise IngestError(IngestErrorCode.TOO_LARGE_PIXELS) from None
    return _parse(done)


def _parse(done: subprocess.CompletedProcess[bytes]) -> Derived:
    out = done.stdout
    if done.returncode in (-9, -24):  # SIGKILL (OOM killer) or SIGXCPU (CPU limit)
        raise IngestError(IngestErrorCode.TOO_LARGE_PIXELS)
    try:
        (size,) = _HEADER.unpack_from(out)
        meta = json.loads(out[_HEADER.size : _HEADER.size + size])
        body = out[_HEADER.size + size :]
        if "error" in meta:
            raise IngestError(IngestErrorCode(meta["error"]))
        main, thumb = body[: meta["main_len"]], body[meta["main_len"] :]
        return Derived(main, thumb, meta["width"], meta["height"], meta["extension"])
    except IngestError:
        raise
    except Exception:  # a crash (segfault, bad import) left no valid result
        raise IngestError(IngestErrorCode.CORRUPT_FILE) from None
