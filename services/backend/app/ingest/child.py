"""Child process entry point: `python -m app.ingest.child KIND PAGE MEMORY_BYTES CPU_SECONDS`.

Reads the file from stdin, applies its own rlimits, writes the result (see sandbox.py).
"""

import json
import resource
import sys

from app.ingest.errors import IngestError, IngestErrorCode
from app.ingest.media import detect_type, normalize_photo, render_plan
from app.ingest.sandbox import _HEADER


def _emit(meta: dict[str, object], main: bytes = b"", thumb: bytes = b"") -> None:
    head = json.dumps(meta).encode()
    sys.stdout.buffer.write(_HEADER.pack(len(head)) + head + main + thumb)
    sys.stdout.buffer.flush()


def _run(kind: str, page_index: int, data: bytes) -> None:
    detect_type(data, kind)  # type: ignore[arg-type]  # kind/type match, empty file
    if kind == "photo":
        photo = normalize_photo(data)
        meta = {"width": photo.width, "height": photo.height, "extension": "jpg"}
        _emit({**meta, "main_len": len(photo.main_jpeg)}, photo.main_jpeg, photo.thumb_jpeg)
    else:
        plan = render_plan(data, page_index)
        meta = {"width": plan.width, "height": plan.height, "extension": "png"}
        _emit({**meta, "main_len": len(plan.png)}, plan.png, plan.thumb_jpeg)


def main(argv: list[str]) -> None:
    kind, page, memory, cpu = argv[0], int(argv[1]), int(argv[2]), int(argv[3])
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    data = sys.stdin.buffer.read()
    try:
        _run(kind, page, data)
    except IngestError as exc:
        _emit({"error": exc.code.value})
    except MemoryError:
        _emit({"error": IngestErrorCode.TOO_LARGE_PIXELS.value})


if __name__ == "__main__":
    main(sys.argv[1:])
