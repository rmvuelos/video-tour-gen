"""Pure image/PDF validation and derivation: bytes in, immutable results out.

Any failure that is not already an IngestError becomes CORRUPT_FILE. MemoryError is the
exception: it propagates so the worker can decide (retry elsewhere, fail the job, restart).
"""

import functools
import io
from collections.abc import Callable
from typing import Literal

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
from PIL import Image, UnidentifiedImageError

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


@_stable_errors
def detect_type(data: bytes, kind: FileKind | None = None) -> FileType:
    """Type by content, not a full decode (name and declared MIME are ignored).

    Images: header and verify(). PDFs: pdfium opens the document. Raises IngestError.
    """
    if not data:
        raise IngestError(IngestErrorCode.EMPTY_FILE)
    if data[:1024].lstrip().startswith(b"%PDF-"):
        _open_pdf(data).close()
        found: FileType = "pdf"
    else:
        with _open_image(data) as image:
            found = _PIL_FORMATS[image.format or ""]
    if kind is not None and found not in ALLOWED_TYPES[kind]:
        raise IngestError(IngestErrorCode.KIND_MISMATCH)
    return found
