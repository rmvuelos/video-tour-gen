import logging
from functools import lru_cache
from typing import Annotated, Any

import httpx2 as httpx
from fastapi import Depends

from app.errors import ApiError
from app.settings import get_settings

logger = logging.getLogger(__name__)

ORIGINALS = "originals"
DERIVED = "derived"
TIMEOUT_SECONDS = 10
LIST_LIMIT = 1000
ISSUER_SUFFIX = "/auth/v1"


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
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    def _call(self, method: str, url: str, **kwargs: Any) -> httpx.Response | None:
        """None for 400/404 (no such object); any other failure is a 502 with no body echoed."""
        try:
            response = self._http.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            logger.warning("storage unreachable: %s", type(exc).__name__)
            raise _unavailable() from exc
        if response.status_code in (400, 404):
            return None
        if response.is_error:
            logger.warning("storage answered %s on %s", response.status_code, method)
            raise _unavailable()
        return response

    def signed_upload_url(self, path: str) -> str:
        response = self._call("POST", f"/object/upload/sign/{ORIGINALS}/{path}")
        if response is None:
            raise _unavailable()
        return f"{self._public}/storage/v1{response.json()['url']}"

    def size(self, path: str) -> int | None:
        response = self._call("GET", f"/object/info/{ORIGINALS}/{path}")
        return None if response is None else int(response.json()["size"])

    def delete(self, bucket: str, paths: list[str]) -> None:
        self._call("DELETE", f"/object/{bucket}", json={"prefixes": paths})

    def delete_prefix(self, bucket: str, prefix: str) -> None:
        # shortcut: one folder level (derived files are flat per file id); recurse if that changes.
        listed = self._call(
            "POST", f"/object/list/{bucket}", json={"prefix": prefix, "limit": LIST_LIMIT}
        )
        names = [] if listed is None else [item["name"] for item in listed.json()]
        if names:
            self.delete(bucket, [f"{prefix}/{name}" for name in names])


def _unavailable() -> ApiError:
    return ApiError(502, "storage_unavailable", "File storage is temporarily unavailable.")


@lru_cache
def get_storage() -> StorageClient:
    settings = get_settings()
    public = settings.supabase_jwt_issuer.removesuffix(ISSUER_SUFFIX)  # what the browser reaches
    return StorageClient(
        settings.supabase_url, public, settings.supabase_secret_key.get_secret_value()
    )


StorageDep = Annotated[StorageClient, Depends(get_storage)]
