"""Pure image/PDF validation and derivation: bytes in, immutable results out.

Threading: pdfium is not thread-safe. Run this only in Celery prefork processes, never in
threads. A pathological file can also be slow (huge page trees, heavy images): the caller
must enforce a per-process time limit (the worker task does, in the next PR).

Any failure that is not already an IngestError becomes CORRUPT_FILE. MemoryError is the
exception: it propagates so the worker can decide (retry elsewhere, fail the job, restart).
"""

import contextlib
import functools
import io
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
from PIL import Image, ImageOps, UnidentifiedImageError

from app.ingest.errors import IngestError, IngestErrorCode
from app.limits import load_input_limits

FileKind = Literal["plan", "photo"]
FileType = Literal["pdf", "jpeg", "png", "webp"]

ALLOWED_TYPES: dict[FileKind, frozenset[FileType]] = {
    "plan": frozenset({"pdf", "png", "jpeg"}),
    "photo": frozenset({"jpeg", "png", "webp"}),
}
_PIL_FORMATS: dict[str, FileType] = {"JPEG": "jpeg", "MPO": "jpeg", "PNG": "png", "WEBP": "webp"}

# 64 MP (8000x8000): above any phone camera, ~190 MB decoded as RGB; stops decompression bombs.
# Checked on the header before decoding; Pillow's own bomb error/warning is only a safety net.
MAX_IMAGE_PIXELS = 64_000_000

PHOTO_MAX_SIDE = 2048  # P-8: enough for the vision models, small to store and send
# A plan needs fine lines and dimensions: 4096 px (~A3 at 250 dpi, one GPU texture)
# caps memory at 16 MP.
PLAN_MAX_SIDE = 4096
THUMB_SIDE = 512
PDF_RENDER_DPI = 200
_PDF_POINTS_PER_INCH = 72
JPEG_QUALITY = 85  # visually lossless for photos; derivatives are re-encoded once from the original


@dataclass(frozen=True, slots=True)
class NormalizedPhoto:
    main_jpeg: bytes
    thumb_jpeg: bytes
    width: int
    height: int


@dataclass(frozen=True, slots=True)
class RenderedPlan:
    png: bytes
    thumb_jpeg: bytes
    width: int
    height: int


def _stable_errors[**P, R](func: Callable[P, R]) -> Callable[P, R]:
    """Public entry points raise IngestError only (MemoryError aside)."""

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return func(*args, **kwargs)
        except (IngestError, MemoryError):
            raise
        except Exception:
            raise IngestError(IngestErrorCode.CORRUPT_FILE) from None

    return wrapper


def _open_image(data: bytes) -> Image.Image:
    """Open and verify an image, mapping Pillow failures to stable codes."""
    try:
        probe = Image.open(io.BytesIO(data))
        if probe.format not in _PIL_FORMATS:
            raise IngestError(IngestErrorCode.UNSUPPORTED_TYPE)
        if probe.width * probe.height > MAX_IMAGE_PIXELS:
            raise IngestError(IngestErrorCode.TOO_LARGE_PIXELS)
        probe.verify()  # verify() invalidates the object, so reopen to decode
        return Image.open(io.BytesIO(data))
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise IngestError(IngestErrorCode.TOO_LARGE_PIXELS) from None
    except UnidentifiedImageError:
        raise IngestError(IngestErrorCode.UNSUPPORTED_TYPE) from None


@functools.cache
def _max_pdf_pages() -> int:
    return load_input_limits().floor_plan.max_pdf_pages


def _open_pdf(data: bytes) -> pdfium.PdfDocument:
    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        if exc.err_code == pdfium_raw.FPDF_ERR_PASSWORD:
            raise IngestError(IngestErrorCode.PDF_ENCRYPTED) from None
        raise IngestError(IngestErrorCode.CORRUPT_FILE) from None
    if len(pdf) > _max_pdf_pages():
        pdf.close()
        raise IngestError(IngestErrorCode.PDF_TOO_MANY_PAGES)
    return pdf


def _is_pdf(data: bytes) -> bool:
    return data[:1024].lstrip().startswith(b"%PDF-")


def _check_kind(found: FileType, kind: FileKind | None) -> None:
    if kind is not None and found not in ALLOWED_TYPES[kind]:
        raise IngestError(IngestErrorCode.KIND_MISMATCH)


@_stable_errors
def detect_type(data: bytes, kind: FileKind | None = None) -> FileType:
    """Type by content, not a full decode (name and declared MIME are ignored).

    Images: header and verify(). PDFs: pdfium opens the document. Raises IngestError.
    """
    if not data:
        raise IngestError(IngestErrorCode.EMPTY_FILE)
    if _is_pdf(data):
        _open_pdf(data).close()
        found: FileType = "pdf"
    else:
        with _open_image(data) as image:
            found = _PIL_FORMATS[image.format or ""]
    _check_kind(found, kind)
    return found


def _encode(image: Image.Image, fmt: Literal["JPEG", "PNG"]) -> bytes:
    # No exif=/icc_profile=: nothing from the original metadata (GPS included) is written.
    # shortcut: the ICC profile is dropped, so wide-gamut colours shift; convert to sRGB if needed.
    out = io.BytesIO()
    if fmt == "JPEG":
        image.save(out, "JPEG", quality=JPEG_QUALITY)
    else:  # default compress_level 6: ~0.8 s for a 16 MP line plan; level 3 saves 0.4 s
        image.save(out, "PNG")
    return out.getvalue()


def _thumbnail(image: Image.Image) -> bytes:
    thumb = image.copy()
    thumb.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS)
    return _encode(thumb, "JPEG")


def _derive(image: Image.Image, max_side: int) -> Image.Image:
    """Shrink first (JPEGs decode at reduced size), then orient and flatten to RGB.

    Never enlarges. Transparency is composed onto white only after shrinking, and only if the
    image has any: going through RGBA at full size would cost 4 bytes per pixel.
    """
    has_alpha = "A" in image.getbands() or "transparency" in image.info
    if image.mode == "P" or (has_alpha and image.mode != "RGBA"):
        image = image.convert("RGBA" if has_alpha else "RGB")  # palettes do not resample well
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    image = ImageOps.exif_transpose(image)
    if not has_alpha:
        return image.convert("RGB")
    white = Image.new("RGBA", image.size, (255, 255, 255, 255))  # not black: it hides plan lines
    return Image.alpha_composite(white, image).convert("RGB")


@_stable_errors
def normalize_photo(data: bytes) -> NormalizedPhoto:
    with _open_image(data) as image:
        photo = _derive(image, PHOTO_MAX_SIDE)
    return NormalizedPhoto(_encode(photo, "JPEG"), _thumbnail(photo), photo.width, photo.height)


def _render_pdf_page(data: bytes, page_index: int) -> Image.Image:
    with _open_pdf(data) as pdf:
        if not 0 <= page_index < len(pdf):
            raise IngestError(IngestErrorCode.PDF_PAGE_OUT_OF_RANGE)
        with contextlib.closing(pdf[page_index]) as page:
            width_pt, height_pt = page.get_size()
            # 200 dpi, but the long side never passes PLAN_MAX_SIDE (a huge page cannot exhaust RAM)
            scale = min(
                PDF_RENDER_DPI / _PDF_POINTS_PER_INCH, PLAN_MAX_SIDE / max(width_pt, height_pt, 1)
            )
            with contextlib.closing(page.render(scale=scale)) as bitmap:
                image: Image.Image = bitmap.to_pil().copy()  # the buffer dies with the bitmap
                return image


@_stable_errors
def render_plan(data: bytes, page_index: int = 0) -> RenderedPlan:
    """Plan page as PNG + thumbnail. Image plans only have page 0."""
    if not data:
        raise IngestError(IngestErrorCode.EMPTY_FILE)
    if _is_pdf(data):
        plan = _derive(_render_pdf_page(data, page_index), PLAN_MAX_SIDE)
    else:
        with _open_image(data) as image:
            _check_kind(_PIL_FORMATS[image.format or ""], "plan")
            if page_index != 0:
                raise IngestError(IngestErrorCode.PDF_PAGE_OUT_OF_RANGE)
            plan = _derive(image, PLAN_MAX_SIDE)
    return RenderedPlan(_encode(plan, "PNG"), _thumbnail(plan), plan.width, plan.height)
