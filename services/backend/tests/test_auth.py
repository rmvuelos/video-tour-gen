import base64
import hmac
import json
import logging
import time
import uuid
from collections.abc import Callable, Iterator
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt import PyJWKClient
from jwt.algorithms import ECAlgorithm

import app.auth as auth
from app.api import app

ISSUER = "http://supabase.test/auth/v1"
USER_ID = str(uuid.uuid4())
KID = "test-key"


def _from_now(seconds: int) -> Callable[[int], int]:
    """Claim value resolved when the token is built, so slow test runs cannot age it."""
    return lambda now: now + seconds


def _jwks(key: ec.EllipticCurvePrivateKey, kid: str = KID) -> dict[str, Any]:
    jwk = json.loads(ECAlgorithm.to_jwk(key.public_key()))
    return {"keys": [{**jwk, "kid": kid, "alg": "ES256", "use": "sig"}]}


@pytest.fixture(scope="module")
def key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


@pytest.fixture
def client(
    fake_env: None, key: ec.EllipticCurvePrivateKey, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: _jwks(key))
    auth.get_jwk_client.cache_clear()
    yield TestClient(app)
    auth.get_jwk_client.cache_clear()


def _token(
    key: ec.EllipticCurvePrivateKey,
    kid: str = KID,
    alg: str = "ES256",
    headers: dict[str, Any] | None = None,
    **overrides: Any,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": USER_ID,
        "email": "ana@example.test",
        "aud": "authenticated",
        "iss": ISSUER,
        "role": "authenticated",
        "iat": now,
        "exp": now + 300,
    }
    claims = {k: v for k, v in {**claims, **overrides}.items() if v is not None}
    claims = {k: v(now) if callable(v) else v for k, v in claims.items()}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid, **(headers or {})})


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _forged(alg: str, key: ec.EllipticCurvePrivateKey) -> str:
    header = _b64(json.dumps({"alg": alg, "typ": "JWT", "kid": KID}).encode())
    claims = {"sub": USER_ID, "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 300}
    signing_input = f"{header}.{_b64(json.dumps(claims).encode())}"
    if alg == "none":
        return signing_input + "."
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    signature = hmac.new(public_pem, signing_input.encode(), "sha256").digest()
    return f"{signing_input}.{_b64(signature)}"


def _get(client: TestClient, token: str) -> Any:
    return client.get("/me", headers=_bearer(token))


def _assert_unauthorized(response: Any) -> None:
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    body = response.json()
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["message"] == "Invalid or missing credentials."


@pytest.mark.parametrize(
    ("overrides", "email"),
    [
        pytest.param({}, "ana@example.test", id="valid"),
        pytest.param({"email": None}, None, id="email-optional"),
        pytest.param({"exp": _from_now(-5)}, "ana@example.test", id="within-leeway"),
        pytest.param({"is_anonymous": False}, "ana@example.test", id="not-anonymous"),
    ],
)
def test_valid_tokens_return_user(
    client: TestClient, key: ec.EllipticCurvePrivateKey, overrides: dict[str, Any], email: Any
) -> None:
    response = _get(client, _token(key, **overrides))

    assert response.status_code == 200
    assert response.json() == {"id": USER_ID, "email": email}


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _claims(**overrides: Any) -> Any:
    return lambda key: _bearer(_token(key, **overrides))


def _corrupted(key: ec.EllipticCurvePrivateKey) -> dict[str, str]:
    head, payload, signature = _token(key).split(".")
    return _bearer(f"{head}.{payload}.{('A' if signature[0] != 'A' else 'B') + signature[1:]}")


def _other_key(curve: ec.EllipticCurve, **kwargs: Any) -> Any:
    return lambda _key: _bearer(_token(ec.generate_private_key(curve), **kwargs))


REJECTED = [
    pytest.param(lambda key: {}, id="no-header"),
    pytest.param(lambda key: {"Authorization": f"Basic {_token(key)}"}, id="basic-scheme"),
    pytest.param(lambda key: {"Authorization": "Bearer "}, id="empty-bearer"),
    pytest.param(lambda key: {"Authorization": f"Bearer {_token(key)} a"}, id="extra-part"),
    pytest.param(lambda key: _bearer("not.a.jwt"), id="garbage-token"),
    pytest.param(_claims(exp=_from_now(-3600)), id="expired"),
    pytest.param(_claims(exp=_from_now(-30)), id="past-leeway"),
    pytest.param(_claims(aud="anon"), id="aud"),
    pytest.param(_claims(iss="http://evil.test/auth/v1"), id="iss"),
    pytest.param(_claims(sub="not-a-uuid"), id="sub-not-uuid"),
    pytest.param(_claims(exp=None), id="no-exp"),
    pytest.param(_claims(sub=None), id="no-sub"),
    pytest.param(_claims(aud=None), id="no-aud"),
    pytest.param(_claims(iss=None), id="no-iss"),
    pytest.param(_claims(role="anon"), id="role-anon"),
    pytest.param(_claims(role="service_role"), id="role-service"),
    pytest.param(_claims(role=None), id="no-role"),
    pytest.param(_claims(iat=None), id="no-iat"),
    pytest.param(_claims(is_anonymous=True), id="is-anonymous"),
    pytest.param(_claims(nbf=_from_now(+3600)), id="nbf-future"),
    pytest.param(_claims(iat=_from_now(+3600)), id="iat-future"),
    pytest.param(_claims(kid="other-kid"), id="unknown-kid"),
    pytest.param(_other_key(ec.SECP256R1()), id="other-key-known-kid"),
    pytest.param(_other_key(ec.SECP384R1(), alg="ES384"), id="es384-known-kid"),
    pytest.param(lambda key: _bearer(_forged("HS256", key)), id="hs256-forged"),
    pytest.param(lambda key: _bearer(_forged("none", key)), id="alg-none"),
    pytest.param(_corrupted, id="corrupted-signature"),
]


@pytest.mark.parametrize("make_headers", REJECTED)
def test_rejected_credentials_are_401(
    client: TestClient, key: ec.EllipticCurvePrivateKey, make_headers: Any
) -> None:
    _assert_unauthorized(client.get("/me", headers=make_headers(key)))


@pytest.fixture
def fetched_uris(key: ec.EllipticCurvePrivateKey, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    uris: list[str] = []

    def fetch(self: PyJWKClient) -> dict[str, Any]:
        uris.append(self.uri)
        return _jwks(key)

    monkeypatch.setattr(PyJWKClient, "fetch_data", fetch)
    return uris


def test_jku_and_x5u_headers_are_ignored(
    client: TestClient, key: ec.EllipticCurvePrivateKey, fetched_uris: list[str]
) -> None:
    headers = {"jku": "http://evil.test/jwks", "x5u": "http://evil.test/cert"}

    assert _get(client, _token(key, headers=headers)).status_code == 200
    assert fetched_uris == ["http://supabase.test/jwks"]


def test_unknown_kid_floods_cause_at_most_two_fetches(
    client: TestClient, key: ec.EllipticCurvePrivateKey, fetched_uris: list[str]
) -> None:
    for _ in range(10):
        _assert_unauthorized(_get(client, _token(key, kid="nope")))

    assert len(fetched_uris) <= 2


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(lambda k: jwt.PyJWKClientConnectionError("connection refused"), id="down"),
        pytest.param(lambda k: json.JSONDecodeError("bad json", "{", 0), id="invalid-json"),
        pytest.param(lambda k: {"keys": []}, id="no-keys"),
        pytest.param(lambda k: [], id="not-an-object"),
        pytest.param(lambda k: {"keys": [{**_jwks(k)["keys"][0], "kid": ""}]}, id="no-kid"),
    ],
)
def test_jwks_failures_are_503(
    client: TestClient,
    key: ec.EllipticCurvePrivateKey,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    payload: Any,
) -> None:
    served = payload(key)

    def fetch(self: PyJWKClient) -> Any:
        if isinstance(served, Exception):
            raise served
        return served

    monkeypatch.setattr(PyJWKClient, "fetch_data", fetch)
    token = _token(key)

    with caplog.at_level(logging.DEBUG):
        response = _get(client, token)

    assert response.status_code == 503
    assert "www-authenticate" not in response.headers
    assert response.json()["error"]["code"] == "auth_unavailable"
    assert "connection refused" not in response.text
    assert token not in caplog.text


def test_jwk_client_is_lazy_and_cached(fake_env: None) -> None:
    auth.get_jwk_client.cache_clear()

    assert auth.get_jwk_client() is auth.get_jwk_client()
    auth.get_jwk_client.cache_clear()


def test_token_never_appears_in_logs(
    client: TestClient, key: ec.EllipticCurvePrivateKey, caplog: pytest.LogCaptureFixture
) -> None:
    token = _token(key, aud="anon")
    with caplog.at_level(logging.DEBUG):
        _get(client, token)

    assert token not in caplog.text
    assert token.split(".")[1] not in caplog.text
