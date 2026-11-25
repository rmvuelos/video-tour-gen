import pytest

from app.ingest import IngestError, IngestErrorCode, detect_type
from tests.ingest_fixtures import (
    encrypted_pdf_bytes,
    image_bytes,
    mpo_bytes,
    pdf_bytes,
    png_header_only,
)


def code_of(exc: pytest.ExceptionInfo[IngestError]) -> IngestErrorCode:
    return exc.value.code


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (pdf_bytes(), "pdf"),
        (image_bytes("JPEG"), "jpeg"),
        (image_bytes("PNG"), "png"),
        (image_bytes("WEBP"), "webp"),
    ],
)
def test_detects_type_from_content(data: bytes, expected: str) -> None:
    assert detect_type(data) == expected


def test_text_renamed_to_image_is_unsupported() -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(b"hello, I am not an image")
    assert code_of(exc) == "unsupported_type"


def test_gif_is_unsupported() -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(image_bytes("GIF"))
    assert code_of(exc) == "unsupported_type"


def test_empty_file() -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(b"")
    assert code_of(exc) == "empty_file"


def test_truncated_pdf_is_corrupt() -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(pdf_bytes()[:40])
    assert code_of(exc) == "corrupt_file"


def test_encrypted_pdf() -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(encrypted_pdf_bytes())
    assert code_of(exc) == "pdf_encrypted"


def test_png_is_valid_as_photo_and_as_plan() -> None:
    png = image_bytes("PNG")
    assert detect_type(png, kind="photo") == "png"
    assert detect_type(png, kind="plan") == "png"


@pytest.mark.parametrize(
    ("data", "kind"),
    [(pdf_bytes(), "photo"), (image_bytes("WEBP"), "plan")],
)
def test_type_must_fit_the_kind(data: bytes, kind: str) -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(data, kind=kind)  # type: ignore[arg-type]
    assert code_of(exc) == "kind_mismatch"


@pytest.mark.filterwarnings("ignore::PIL.Image.DecompressionBombWarning")
@pytest.mark.parametrize("side", [8001, 10_000, 11_000])  # 64.02 MP to 121 MP
def test_declared_pixels_over_the_limit_are_too_large(side: int) -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(png_header_only(side, side))
    assert code_of(exc) == "too_large_pixels"


def test_pillow_bomb_error_is_mapped_too() -> None:
    with pytest.raises(IngestError) as exc:
        detect_type(png_header_only(70_000, 70_000))  # Pillow itself raises above 2x its limit
    assert code_of(exc) == "too_large_pixels"


def test_mpo_camera_jpeg_counts_as_jpeg() -> None:
    assert detect_type(mpo_bytes(), kind="photo") == "jpeg"


def test_public_types_are_exported() -> None:
    from app.ingest import FileKind, FileType

    assert FileKind and FileType
