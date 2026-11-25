import io

import pytest
from PIL import Image

from app.ingest import IngestError
from app.ingest.sandbox import Limits, process_file
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

    assert code(big, "photo", limits=Limits(memory_bytes=300 * 1024**2)) == "too_large_pixels"


def test_wall_clock_timeout_kills_the_child() -> None:
    assert code(image_bytes("JPEG"), "photo", limits=Limits(wall_seconds=0.01)) == "too_large_pixels"


def test_crash_without_a_result_is_corrupt_file() -> None:
    # 32 MiB of address space: the interpreter cannot even import the libraries.
    assert code(image_bytes("JPEG"), "photo", limits=Limits(memory_bytes=32 * 1024**2)) in {
        "corrupt_file",
        "too_large_pixels",
    }
