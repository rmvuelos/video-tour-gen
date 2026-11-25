import io

import pytest
from PIL import Image

from app.ingest import IngestError, normalize_photo
from tests.ingest_fixtures import image_bytes, mpo_bytes, png_header_only

GPS_IFD = 0x8825
ORIENTATION = 0x0112
MODEL = 0x0110


def pixel(data: bytes, xy: tuple[int, int]) -> tuple[int, ...]:
    value = Image.open(io.BytesIO(data)).getpixel(xy)
    assert isinstance(value, tuple)
    return value


def jpeg_with_exif(size: tuple[int, int]) -> bytes:
    exif = Image.Exif()
    exif[ORIENTATION] = 6
    exif[MODEL] = "SecretCam 9000"
    exif.get_ifd(GPS_IFD)[2] = (40.0, 26.0, 46.0)
    return image_bytes("JPEG", size, exif=exif)


def test_derivatives_have_no_exif_gps_or_camera_model() -> None:
    result = normalize_photo(jpeg_with_exif((400, 300)))

    for blob in (result.main_jpeg, result.thumb_jpeg):
        assert len(Image.open(io.BytesIO(blob)).getexif()) == 0
        assert b"Exif" not in blob
        assert b"SecretCam" not in blob


def test_orientation_is_applied_before_stripping() -> None:
    result = normalize_photo(jpeg_with_exif((400, 300)))

    assert (result.width, result.height) == (300, 400)


def test_long_side_is_capped_at_2048_and_thumb_at_512() -> None:
    result = normalize_photo(image_bytes("JPEG", (4096, 2048)))

    assert (result.width, result.height) == (2048, 1024)
    assert Image.open(io.BytesIO(result.main_jpeg)).size == (2048, 1024)
    assert Image.open(io.BytesIO(result.thumb_jpeg)).size == (512, 256)


def test_small_photo_is_not_enlarged() -> None:
    result = normalize_photo(image_bytes("PNG", (100, 80)))

    assert (result.width, result.height) == (100, 80)


def test_webp_and_transparent_png_become_rgb_jpeg() -> None:
    out = io.BytesIO()
    Image.new("RGBA", (50, 50), (0, 0, 0, 0)).save(out, "PNG")

    for data in (image_bytes("WEBP"), out.getvalue()):
        image = Image.open(io.BytesIO(normalize_photo(data).main_jpeg))
        assert (image.format, image.mode) == ("JPEG", "RGB")


def test_truncated_image_is_corrupt() -> None:
    with pytest.raises(IngestError) as exc:
        normalize_photo(image_bytes("JPEG", (400, 300))[:300])
    assert exc.value.code == "corrupt_file"


def test_oversized_image_is_rejected_before_decoding() -> None:
    with pytest.raises(IngestError) as exc:
        normalize_photo(png_header_only(9000, 9000))
    assert exc.value.code == "too_large_pixels"


def test_mpo_uses_first_frame_as_jpeg() -> None:
    result = normalize_photo(mpo_bytes())

    assert Image.open(io.BytesIO(result.main_jpeg)).format == "JPEG"
    assert pixel(result.main_jpeg, (10, 10))[0] > 150  # red first frame


def test_transparent_pixels_become_white() -> None:
    out = io.BytesIO()
    Image.new("RGBA", (40, 40), (0, 0, 0, 0)).save(out, "PNG")

    result = normalize_photo(out.getvalue())

    assert min(pixel(result.main_jpeg, (5, 5))) >= 250


def test_exif_rotation_moves_the_marked_pixel() -> None:
    source = Image.new("RGB", (40, 20), (255, 0, 0))
    source.paste((0, 0, 255), (0, 0, 8, 8))  # blue block in the top-left corner
    exif = Image.Exif()
    exif[ORIENTATION] = 6  # rotate 90 degrees clockwise to display
    out = io.BytesIO()
    source.save(out, "JPEG", quality=95, exif=exif)

    result = normalize_photo(out.getvalue())

    assert (result.width, result.height) == (20, 40)
    assert pixel(result.main_jpeg, (15, 4))[2] > 150  # now in the top-right corner
    assert pixel(result.main_jpeg, (4, 4))[0] > 150  # where the block was, it is red


def test_unexpected_decoder_errors_become_corrupt_file(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*_: object, **__: object) -> None:
        raise RuntimeError("decoder blew up")

    monkeypatch.setattr(Image.Image, "thumbnail", boom)
    with pytest.raises(IngestError) as exc:
        normalize_photo(image_bytes("JPEG"))
    assert exc.value.code == "corrupt_file"


def test_memory_error_is_not_swallowed(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*_: object, **__: object) -> None:
        raise MemoryError

    monkeypatch.setattr(Image.Image, "thumbnail", boom)
    with pytest.raises(MemoryError):
        normalize_photo(image_bytes("JPEG"))


def test_pdf_is_not_a_photo() -> None:
    with pytest.raises(IngestError) as exc:
        normalize_photo(b"%PDF-1.4 nope")
    assert exc.value.code == "unsupported_type"
