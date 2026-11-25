import json
import struct

import pytest

from app.ingest import IngestError
from app.ingest.wire import Derived, decode, encode_error, encode_result

GOOD = Derived(b"main", b"thumb", 20, 10, "jpg")


def frame(meta: dict[str, object], body: bytes = b"mainthumb") -> bytes:
    head = json.dumps(meta).encode()
    return struct.pack(">I", len(head)) + head + body


def meta(**changes: object) -> dict[str, object]:
    return {"width": 20, "height": 10, "extension": "jpg", "main_len": 4, **changes}


def test_a_result_survives_the_round_trip() -> None:
    assert decode(encode_result(GOOD)) == GOOD


def test_an_error_frame_raises_the_ingest_error() -> None:
    with pytest.raises(IngestError) as exc:
        decode(encode_error("pdf_encrypted"))

    assert str(exc.value.code) == "pdf_encrypted"


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"\x00\x00",
        struct.pack(">I", 999) + b"{}",
        frame(meta(extension="exe")),
        frame(meta(main_len=0)),
        frame(meta(main_len=9)),  # no bytes left for the thumbnail
        frame(meta(width=0)),
        frame(meta(width=True)),
        frame(meta(height=10**6)),
        frame(meta(width="20")),
        frame({"error": "made_up_code"}),
        frame({"nothing": 1}),
        frame([1]),  # type: ignore[arg-type]
    ],
)
def test_a_malformed_frame_is_a_value_error(data: bytes) -> None:
    with pytest.raises(ValueError, match=r".*"):
        decode(data)
