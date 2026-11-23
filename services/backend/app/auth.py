import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, Header
from jwt import PyJWKClient

from app.errors import ApiError
from app.settings import get_settings

logger = logging.getLogger(__name__)

ALGORITHMS = ["ES256"]  # closed list: never HS256 or "none"
LEEWAY_SECONDS = 10
JWKS_TIMEOUT_SECONDS = 3
UNKNOWN_KID_PREFIX = "Unable to find a signing key"


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
    # Lazy; PyJWKClient's own 300 s JWK-set cache honours key rotation.
    return PyJWKClient(get_settings().supabase_jwks_url, timeout=JWKS_TIMEOUT_SECONDS)


def _signing_key(token: str) -> Any:
    """Fetch the key for the token's kid. JWKS problems are 503, token problems are 401."""
    try:
        return get_jwk_client().get_signing_key_from_jwt(token).key
    except (jwt.PyJWKClientConnectionError, jwt.PyJWKSetError, json.JSONDecodeError) as exc:
        raise _unavailable(exc) from exc
    except jwt.PyJWKClientError as exc:
        # PyJWT gives no own type for "unknown kid" vs "bad JWKS": only the message differs.
        if str(exc).startswith(UNKNOWN_KID_PREFIX):
            raise _unauthorized() from exc
        raise _unavailable(exc) from exc
    except jwt.PyJWTError as exc:  # malformed token header
        logger.info("token rejected: %s", type(exc).__name__)
        raise _unauthorized() from exc


def _unavailable(exc: Exception) -> ApiError:
    # Our infra problem, not a bad token: 503 so clients do not drop a good session.
    logger.warning("JWKS unusable: %s", type(exc).__name__)
    return ApiError(503, "auth_unavailable", "Authentication is temporarily unavailable.")


def current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    parts = (authorization or "").split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise _unauthorized()
    token = parts[1]
    key = _signing_key(token)
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=ALGORITHMS,
            audience="authenticated",
            issuer=get_settings().supabase_jwt_issuer,
            options={"require": ["exp", "iat", "sub", "aud", "iss", "role"]},
            leeway=LEEWAY_SECONDS,
        )
        if claims["role"] != "authenticated" or claims.get("is_anonymous") is True:
            raise ValueError("not a signed-in user")
        email = claims.get("email")
        return CurrentUser(id=UUID(claims["sub"]), email=email if isinstance(email, str) else None)
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        logger.info("token rejected: %s", type(exc).__name__)
        raise _unauthorized() from exc


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]
