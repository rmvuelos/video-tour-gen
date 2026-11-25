import unicodedata
from uuid import UUID

from app.errors import ApiError

FORBIDDEN_CATEGORIES = {"Cc", "Cf", "Cs"}  # control, format (zero-width, bidi), surrogates


def printable(value: str) -> str:
    if any(unicodedata.category(c) in FORBIDDEN_CATEGORIES for c in value):
        raise ValueError("must not contain control or invisible characters")
    return value


def not_found(what: str = "Project") -> ApiError:
    return ApiError(404, "not_found", f"{what} not found.")


def parse_id(value: str, what: str = "Project") -> UUID:
    try:
        return UUID(value)
    except ValueError:  # 404, not 422: do not tell a malformed id from an unknown one
        raise not_found(what) from None
