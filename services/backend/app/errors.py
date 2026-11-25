import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ErrorDetail(BaseModel):
    """One problem inside an error, e.g. one rejected file."""

    code: str
    message: str
    index: int | None = None
    file_id: str | None = None
    filename: str | None = None


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# For `responses=` on routes, so OpenAPI documents the common error envelope.
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorResponse} for code in (404, 409, 422, 429, 502)
}


class ApiError(Exception):
    """Raise anywhere to answer with the common {"error": {"code", "message"}} body."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers
        self.details = details


def _handle_api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    error: dict[str, Any] = {"code": exc.code, "message": exc.message}
    if exc.details:
        error["details"] = [d.model_dump(exclude_none=True) for d in exc.details]
    return JSONResponse(
        {"error": error},
        status_code=exc.status_code,
        headers=exc.headers,
    )


def _handle_validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Field and rule only: pydantic's "input" would echo what the client sent.
    message = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
    return JSONResponse({"error": {"code": "validation_error", "message": message}}, 422)


def _handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled error", exc_info=exc)  # the detail stays in the server log
    return JSONResponse(
        {"error": {"code": "internal_error", "message": "Something went wrong."}}, 500
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected)
