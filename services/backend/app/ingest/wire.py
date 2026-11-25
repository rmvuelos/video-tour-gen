"""Frame the sandbox child writes to its stdout, and the parent's strict reader.

Layout: 4-byte big-endian JSON length, the JSON, main bytes, thumb bytes. The parent treats the
child as untrusted (it just parsed a hostile file): `decode` checks every field.
"""

import json
import struct
from dataclasses import dataclass
from typing import Any

from app.ingest.errors import IngestError, IngestErrorCode

HEADER = struct.Struct(">I")
MAX_OUTPUT_BYTES = 64 * 1024 * 1024  # the child's RLIMIT_FSIZE: derivatives are far smaller
MAX_SIDE = 4096  # PLAN_MAX_SIDE, the largest derivative
EXTENSIONS = frozenset({"jpg", "png"})


@dataclass(frozen=True, slots=True)
class Derived:
    main: bytes
    thumb: bytes
    width: int
    height: int
    extension: str  # "jpg" for photos, "png" for plans; the thumbnail is always a JPEG


def _frame(meta: dict[str, Any], body: bytes = b"") -> bytes:
    head = json.dumps(meta).encode()
    return HEADER.pack(len(head)) + head + body


def encode_result(derived: Derived) -> bytes:
    meta = {
        "width": derived.width,
        "height": derived.height,
        "extension": derived.extension,
        "main_len": len(derived.main),
    }
    return _frame(meta, derived.main + derived.thumb)


def encode_error(code: str) -> bytes:
    return _frame({"error": code})


def _dimension(value: object) -> int:
    if type(value) is not int or not 0 < value <= MAX_SIDE:
        raise ValueError("bad dimension")
    return value


def decode(data: bytes) -> Derived:
    """The child's result. Raises IngestError for an error frame, ValueError for anything odd."""
    try:
        (size,) = HEADER.unpack_from(data)
    except struct.error as exc:
        raise ValueError("short frame") from exc
    meta = json.loads(data[HEADER.size : HEADER.size + size])
    if not isinstance(meta, dict):
        raise ValueError("header is not an object")
    if "error" in meta:
        raise IngestError(IngestErrorCode(meta["error"]))
    body = data[HEADER.size + size :]
    main_len = meta.get("main_len")
    if type(main_len) is not int or not 0 < main_len < len(body):
        raise ValueError("bad main_len")
    if meta.get("extension") not in EXTENSIONS:
        raise ValueError("bad extension")
    return Derived(
        body[:main_len],
        body[main_len:],
        _dimension(meta.get("width")),
        _dimension(meta.get("height")),
        meta["extension"],
    )
