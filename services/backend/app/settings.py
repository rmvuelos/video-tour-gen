from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.local", extra="ignore")

    supabase_url: str
    supabase_jwks_url: str
    supabase_secret_key: SecretStr
    redis_url: str
    database_url: SecretStr  # carries the DB password: never log it


@lru_cache
def get_settings() -> Settings:
    """Validate the environment. Call at process startup, never at import time."""
    return Settings()
