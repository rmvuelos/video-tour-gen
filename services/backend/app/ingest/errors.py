from enum import StrEnum


class IngestErrorCode(StrEnum):
    """Stable codes stored in project_files.error_code; never rename them."""

    UNSUPPORTED_TYPE = "unsupported_type"
    KIND_MISMATCH = "kind_mismatch"
    CORRUPT_FILE = "corrupt_file"
    TOO_LARGE_PIXELS = "too_large_pixels"
    PDF_ENCRYPTED = "pdf_encrypted"
    PDF_TOO_MANY_PAGES = "pdf_too_many_pages"
    PDF_PAGE_OUT_OF_RANGE = "pdf_page_out_of_range"
    EMPTY_FILE = "empty_file"


class IngestError(Exception):
    """A validation failure; not retryable (the file itself is bad)."""

    def __init__(self, code: IngestErrorCode) -> None:
        # args == (code,) so pickle/copy rebuild it as IngestError(code) (Celery serializes it)
        super().__init__(code)
        self.code = code
