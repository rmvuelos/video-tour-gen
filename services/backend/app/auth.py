import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Header
from jwt import PyJWKClient

from app.errors import ApiError
from app.settings import get_settings

logger = logging.getLogger(__name__)

ALGORITHMS = ["ES256"]  # closed list: never HS256 or "none"
LEEWAY_SECONDS = 10


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None


def _unauthorized() -> ApiError:
    return ApiError(
        401, "unauthorized", "Invalid or missing credentials.", {"WWW-Authenticate": "Bearer"}
    )


@lru_cache
def get_jwk_client() -> PyJWKClient:
    # Built on first use, never at import; PyJWKClient caches the fetched keys.
    return PyJWKClient(get_settings().supabase_jwks_url, cache_keys=True)


def current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    try:
        key = get_jwk_client().get_signing_key_from_jwt(token.strip()).key
        claims = jwt.decode(
            token.strip(),
            key,
            algorithms=ALGORITHMS,
            audience="authenticated",
            issuer=get_settings().supabase_jwt_issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
            leeway=LEEWAY_SECONDS,
        )
        email = claims.get("email")
        return CurrentUser(id=UUID(claims["sub"]), email=email if isinstance(email, str) else None)
    except jwt.PyJWKClientConnectionError as exc:
        # Our infra problem, not a bad token: 503 so clients do not drop a good session.
        logger.warning("JWKS unreachable: %s", type(exc).__name__)
        raise ApiError(
            503, "auth_unavailable", "Authentication is temporarily unavailable."
        ) from exc
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        logger.info("token rejected: %s", type(exc).__name__)
        raise _unauthorized() from exc


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]
