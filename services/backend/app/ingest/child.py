"""Child process entry point: `python -m app.ingest.child KIND PAGE MEMORY_BYTES CPU_SECONDS`.

Reads the file from stdin, applies its own rlimits, writes the frame described in wire.py.
"""

import resource
import sys

from app.ingest.errors import IngestError, IngestErrorCode
from app.ingest.media import detect_type, normalize_photo, render_plan
from app.ingest.wire import MAX_OUTPUT_BYTES, Derived, encode_error, encode_result

KINDS = ("photo", "plan")
OPEN_FILES = 32


def _limit(which: int, value: int) -> None:
    resource.setrlimit(which, (value, value))


def _run(kind: str, page_index: int, data: bytes) -> Derived:
    detect_type(data, kind)  # type: ignore[arg-type]  # kind/type match, empty file
    if kind == "photo":
        photo = normalize_photo(data)
        return Derived(photo.main_jpeg, photo.thumb_jpeg, photo.width, photo.height, "jpg")
    plan = render_plan(data, page_index)
    return Derived(plan.png, plan.thumb_jpeg, plan.width, plan.height, "png")


def main(argv: list[str]) -> int:
    kind, page, memory, cpu = argv[0], int(argv[1]), int(argv[2]), int(argv[3])
    if kind not in KINDS:
        sys.stderr.write(f"unknown kind {kind!r}\n")
        return 2
    _limit(resource.RLIMIT_AS, memory)
    _limit(resource.RLIMIT_CPU, cpu)
    _limit(resource.RLIMIT_FSIZE, MAX_OUTPUT_BYTES)  # stdout is a file: this caps it
    _limit(resource.RLIMIT_NOFILE, OPEN_FILES)
    _limit(resource.RLIMIT_NPROC, 0)  # no fork/threads: the parser never needs them
    data = sys.stdin.buffer.read()
    try:
        frame = encode_result(_run(kind, page, data))
    except IngestError as exc:
        frame = encode_error(exc.code.value)
    except MemoryError:
        frame = encode_error(IngestErrorCode.TOO_LARGE_PIXELS.value)
    sys.stdout.buffer.write(frame)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
