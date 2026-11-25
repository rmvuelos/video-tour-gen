import io

import pytest
from PIL import Image

from app.ingest import IngestError
from app.ingest.sandbox import Limits, _interpret, process_file
from tests.ingest_fixtures import encrypted_pdf_bytes, image_bytes, pdf_bytes


def code(data: bytes, kind: str, page: int = 0, limits: Limits | None = None) -> str:
    with pytest.raises(IngestError) as exc:
        process_file(data, kind, page, limits or Limits())  # type: ignore[arg-type]
    return str(exc.value.code)


def test_photo_comes_back_as_jpeg_with_thumbnail() -> None:
    result = process_file(image_bytes("PNG", (3000, 1000)), "photo", 0)

    assert (result.width, result.height, result.extension) == (2048, 683, "jpg")
    assert Image.open(io.BytesIO(result.main)).format == "JPEG"
    assert max(Image.open(io.BytesIO(result.thumb)).size) == 512


def test_plan_page_comes_back_as_png() -> None:
    result = process_file(pdf_bytes(3), "plan", 2)

    assert (result.width, result.height, result.extension) == (1653, 2339, "png")
    assert Image.open(io.BytesIO(result.main)).format == "PNG"


@pytest.mark.parametrize(
    ("data", "kind", "expected"),
    [
        (b"not an image", "photo", "unsupported_type"),
        (encrypted_pdf_bytes(), "plan", "pdf_encrypted"),
        (pdf_bytes(1), "photo", "kind_mismatch"),
        (b"", "photo", "empty_file"),
    ],
)
def test_validation_codes_cross_the_process_boundary(data: bytes, kind: str, expected: str) -> None:
    assert code(data, kind) == expected


def test_page_out_of_range_for_plans() -> None:
    assert code(pdf_bytes(3), "plan", 3) == "pdf_page_out_of_range"


def test_memory_limit_becomes_too_large_pixels() -> None:
    big = image_bytes("PNG", (6000, 6000))  # ~108 MB decoded

    assert code(big, "photo", limits=Limits(memory_bytes=128 * 1024**2)) == "too_large_pixels"


def test_wall_clock_timeout_kills_the_child() -> None:
    assert (
        code(image_bytes("JPEG"), "photo", limits=Limits(wall_seconds=0.01)) == "too_large_pixels"
    )


@pytest.mark.parametrize("returncode", [-9, -24, -25])  # KILL (OOM), CPU limit, file size limit
def test_limit_signals_are_too_large_pixels(returncode: int) -> None:
    with pytest.raises(IngestError) as exc:
        _interpret(returncode, b"", b"")

    assert str(exc.value.code) == "too_large_pixels"


def test_a_segfault_is_a_corrupt_file() -> None:
    with pytest.raises(IngestError) as exc:
        _interpret(-11, b"", b"")

    assert str(exc.value.code) == "corrupt_file"


@pytest.mark.parametrize(("returncode", "out"), [(1, b"garbage"), (0, b""), (2, b"")])
def test_a_child_bug_is_a_runtime_error_with_the_stderr_logged(
    returncode: int, out: bytes, caplog: pytest.LogCaptureFixture
) -> None:
    with pytest.raises(RuntimeError):
        _interpret(returncode, out, b"Traceback: boom")

    assert "boom" in caplog.text and f"returncode={returncode}" in caplog.text


def test_an_unknown_kind_is_a_bug_not_a_bad_file() -> None:
    with pytest.raises(RuntimeError):
        process_file(image_bytes("JPEG"), "video", 0)  # type: ignore[arg-type]
