import os
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlparse

from pydantic import AfterValidator, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


def _http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("must be an http(s) URL")
    return value  # kept verbatim: the issuer must match the token's iss exactly


HttpUrl = Annotated[str, AfterValidator(_http_url)]


class Settings(BaseSettings):
    # IGNORE_LOCAL_ENV=1 (CI, verify:ci) keeps tests from reading a developer's .env.local.
    model_config = SettingsConfigDict(
        env_file=None if os.environ.get("IGNORE_LOCAL_ENV") else ".env.local", extra="ignore"
    )

    supabase_url: str
    supabase_jwks_url: HttpUrl
    supabase_jwt_issuer: HttpUrl  # public Supabase URL + /auth/v1: must match the token's iss
    supabase_secret_key: SecretStr
    redis_url: str
    database_url: SecretStr  # carries the DB password: never log it


@lru_cache
def get_settings() -> Settings:
    """Validate the environment. Call at process startup, never at import time."""
    return Settings()
