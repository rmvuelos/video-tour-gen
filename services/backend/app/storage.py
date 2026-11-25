import logging
from typing import Annotated, Any, Protocol

import httpx2 as httpx
from fastapi import Depends, Request

from app.errors import ApiError
from app.settings import get_settings

logger = logging.getLogger(__name__)

ORIGINALS = "originals"
DERIVED = "derived"
TIMEOUT = httpx.Timeout(10, connect=3)
TRANSFER_TIMEOUT = httpx.Timeout(60, connect=3)  # originals are up to 20 MB
LIST_LIMIT = 1000
ISSUER_SUFFIX = "/auth/v1"


class ObjectStorage(Protocol):
    def signed_upload_url(self, path: str) -> str: ...
    def size(self, path: str) -> int | None: ...
    def delete(self, bucket: str, paths: list[str]) -> None: ...
    def delete_prefix(self, bucket: str, prefix: str) -> None: ...
    def download(self, bucket: str, path: str) -> bytes | None: ...
    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None: ...


class StorageClient:
    """Minimal Supabase Storage client (service key). Objects live at {user}/{project}/{file}."""

    def __init__(
        self,
        base_url: str,
        public_url: str,
        secret_key: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._public = public_url.rstrip("/")
        self._http = httpx.Client(
            base_url=f"{base_url.rstrip('/')}/storage/v1",
            headers={"apikey": secret_key, "authorization": f"Bearer {secret_key}"},
            timeout=TIMEOUT,
            transport=transport,
        )

    def _call(self, method: str, url: str, **kwargs: Any) -> httpx.Response | None:
        """None when the object does not exist; any other failure is a 502 with no body echoed."""
        try:
            response = self._http.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            logger.warning("storage unreachable: %s", type(exc).__name__)
            raise _unavailable() from exc
        if _is_missing(response):
            return None
        if response.is_error:
            logger.warning("storage answered %s on %s", response.status_code, method)
            raise _unavailable()
        return response

    def _json(self, response: httpx.Response, *keys: str) -> Any:
        """The decoded body, or a 502 when it is not the shape Storage promises."""
        try:
            body = response.json()
            for key in keys:
                body = body[key]
        except (ValueError, KeyError, TypeError) as exc:
            logger.warning("storage sent an unexpected body: %s", type(exc).__name__)
            raise _unavailable() from exc
        return body

    def close(self) -> None:
        self._http.close()

    def signed_upload_url(self, path: str) -> str:
        response = self._call("POST", f"/object/upload/sign/{ORIGINALS}/{path}")
        if response is None:
            raise _unavailable()
        return f"{self._public}/storage/v1{self._json(response, 'url')}"

    def size(self, path: str) -> int | None:
        response = self._call("GET", f"/object/info/{ORIGINALS}/{path}")
        if response is None:
            return None
        size = self._json(response, "size")
        if not isinstance(size, int):
            raise _unavailable()
        return size

    def delete(self, bucket: str, paths: list[str]) -> None:
        self._call("DELETE", f"/object/{bucket}", json={"prefixes": paths})

    def download(self, bucket: str, path: str) -> bytes | None:
        response = self._call("GET", f"/object/{bucket}/{path}", timeout=TRANSFER_TIMEOUT)
        return None if response is None else response.content

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        # x-upsert: a retried job overwrites what a half-finished attempt left.
        headers = {"content-type": content_type, "x-upsert": "true"}
        response = self._call(
            "POST", f"/object/{bucket}/{path}", content=data, headers=headers,
            timeout=TRANSFER_TIMEOUT,
        )  # fmt: skip
        if response is None:
            raise _unavailable()

    def delete_prefix(self, bucket: str, prefix: str) -> None:
        # shortcut: one folder level (derived files are flat per file id); recurse if that changes.
        listed = self._call(
            "POST", f"/object/list/{bucket}", json={"prefix": prefix, "limit": LIST_LIMIT}
        )
        names = [] if listed is None else [item["name"] for item in self._json(listed)]
        if names:
            self.delete(bucket, [f"{prefix}/{name}" for name in names])


def _unavailable() -> ApiError:
    return ApiError(502, "storage_unavailable", "File storage is temporarily unavailable.")


def _is_missing(response: httpx.Response) -> bool:
    if response.status_code == 404:
        return True
    if response.status_code != 400:
        return False
    try:  # Storage answers a missing object with 400 and statusCode "404" in the body
        return str(response.json().get("statusCode")) == "404"
    except (ValueError, AttributeError):
        return False


def create_storage() -> StorageClient:
    """Call from the lifespan, never at import."""
    settings = get_settings()
    public = settings.supabase_jwt_issuer.removesuffix(ISSUER_SUFFIX)  # what the browser reaches
    return StorageClient(
        settings.supabase_url, public, settings.supabase_secret_key.get_secret_value()
    )


def get_storage(request: Request) -> ObjectStorage:
    storage: ObjectStorage = request.app.state.storage
    return storage


StorageDep = Annotated[ObjectStorage, Depends(get_storage)]
