import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import app
from app.errors import ApiError, ErrorDetail, install_error_handlers
from app.validation import not_found, parse_id, printable


@pytest.mark.parametrize("value", ["Casa", "Ñandú 🏠'; --", "a b"])
def test_printable_accepts_ordinary_text(value: str) -> None:
    assert printable(value) == value


@pytest.mark.parametrize("value", ["a\u0000b", "a\u200bb", "\u202egpj", "a\nb"])
def test_printable_rejects_control_and_invisible_characters(value: str) -> None:
    with pytest.raises(ValueError, match="invisible"):
        printable(value)


def test_parse_id_hides_the_difference_between_malformed_and_unknown() -> None:
    with pytest.raises(ApiError) as caught:
        parse_id("not-a-uuid", "File")

    assert caught.value.status_code == 404
    assert caught.value.message == "File not found."
    assert not_found().message == "Project not found."
    assert str(parse_id("6f1c1d0e-0000-4000-8000-000000000001"))[:8] == "6f1c1d0e"


def test_error_details_are_serialised_without_empty_fields() -> None:
    probe = FastAPI()
    install_error_handlers(probe)

    @probe.get("/boom")
    def boom() -> None:
        raise ApiError(
            422, "invalid_files", "Bad.", details=[ErrorDetail(code="x", message="m", index=1)]
        )

    body = TestClient(probe).get("/boom").json()

    assert body == {
        "error": {
            "code": "invalid_files",
            "message": "Bad.",
            "details": [{"code": "x", "message": "m", "index": 1}],
        }
    }


def test_openapi_documents_the_error_envelope_and_its_details() -> None:
    schemas = app.openapi()["components"]["schemas"]

    assert {"code", "message"} <= set(schemas["ErrorDetail"]["properties"])
    assert "error" in schemas["ErrorResponse"]["properties"]
