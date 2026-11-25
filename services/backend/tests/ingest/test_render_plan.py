import io

import pypdfium2 as pdfium
import pytest
from PIL import Image

from app.ingest import IngestError, render_plan
from tests.ingest_fixtures import encrypted_pdf_bytes, image_bytes, pdf_bytes


def code(data: bytes, page: int = 0) -> str:
    with pytest.raises(IngestError) as exc:
        render_plan(data, page)
    return str(exc.value.code)


def test_renders_requested_pdf_page_at_200_dpi() -> None:
    result = render_plan(pdf_bytes(3), 2)

    assert (result.width, result.height) == (1653, 2339)  # A4 at 200 dpi
    assert Image.open(io.BytesIO(result.png)).format == "PNG"
    assert max(Image.open(io.BytesIO(result.thumb_jpeg)).size) == 512


def test_huge_page_is_capped_at_4096() -> None:
    result = render_plan(pdf_bytes(1, (3370, 2384)))  # A0 landscape

    assert max(result.width, result.height) == 4096


def test_page_index_out_of_range() -> None:
    assert code(pdf_bytes(3), 3) == "pdf_page_out_of_range"
    assert code(pdf_bytes(3), -1) == "pdf_page_out_of_range"


def test_more_than_50_pages_is_rejected() -> None:
    assert code(pdf_bytes(51)) == "pdf_too_many_pages"


def test_encrypted_and_corrupt_pdfs() -> None:
    assert code(encrypted_pdf_bytes()) == "pdf_encrypted"
    assert code(pdf_bytes()[:40]) == "corrupt_file"


def test_photo_only_types_and_empty_are_rejected() -> None:
    assert code(image_bytes("WEBP")) == "kind_mismatch"
    assert code(b"") == "empty_file"


def test_image_plan_keeps_detail_up_to_4096_and_only_has_page_zero() -> None:
    data = image_bytes("PNG", (5000, 3000))

    plan = render_plan(data)
    assert (plan.width, plan.height) == (4096, 2458)
    assert code(data, 1) == "pdf_page_out_of_range"
    assert render_plan(image_bytes("JPEG", (800, 600))).width == 800


def test_pdf_is_opened_only_once(monkeypatch: pytest.MonkeyPatch) -> None:
    data = pdf_bytes(2)
    opened: list[int] = []
    original_init = pdfium.PdfDocument.__init__

    def counting_init(self: pdfium.PdfDocument, *args: object, **kwargs: object) -> None:
        opened.append(1)
        original_init(self, *args, **kwargs)

    monkeypatch.setattr(pdfium.PdfDocument, "__init__", counting_init)
    render_plan(data, 1)

    assert len(opened) == 1


def test_render_failure_inside_pdfium_is_corrupt_file(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*_: object, **__: object) -> None:
        raise pdfium.PdfiumError("render failed")

    monkeypatch.setattr(pdfium.PdfPage, "render", boom)

    assert code(pdf_bytes(1)) == "corrupt_file"
