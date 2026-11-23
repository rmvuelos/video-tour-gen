import base64
import hmac
import json
import logging
import time
import uuid
from collections.abc import Iterator
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


def _token(key: ec.EllipticCurvePrivateKey, kid: str = KID, **overrides: Any) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": USER_ID,
        "email": "ana@example.test",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": now + 300,
    }
    claims = {k: v for k, v in {**claims, **overrides}.items() if v is not None}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": kid})


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
    return client.get("/me", headers={"Authorization": f"Bearer {token}"})


def _assert_unauthorized(response: Any) -> None:
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    body = response.json()
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["message"] == "Invalid or missing credentials."


def test_valid_token_returns_user(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    response = _get(client, _token(key))

    assert response.status_code == 200
    assert response.json() == {"id": USER_ID, "email": "ana@example.test"}


def test_email_is_optional(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    response = _get(client, _token(key, email=None))

    assert response.status_code == 200
    assert response.json() == {"id": USER_ID, "email": None}


def test_missing_header_is_401(client: TestClient) -> None:
    _assert_unauthorized(client.get("/me"))


def test_basic_scheme_is_401(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    response = client.get("/me", headers={"Authorization": f"Basic {_token(key)}"})

    _assert_unauthorized(response)


def test_empty_bearer_is_401(client: TestClient) -> None:
    _assert_unauthorized(client.get("/me", headers={"Authorization": "Bearer "}))


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": int(time.time()) - 3600},
        {"aud": "anon"},
        {"iss": "http://evil.test/auth/v1"},
        {"sub": "not-a-uuid"},
        {"exp": None},
        {"sub": None},
        {"aud": None},
        {"iss": None},
    ],
    ids=["expired", "aud", "iss", "sub-not-uuid", "no-exp", "no-sub", "no-aud", "no-iss"],
)
def test_bad_claims_are_401(
    client: TestClient, key: ec.EllipticCurvePrivateKey, overrides: dict[str, Any]
) -> None:
    _assert_unauthorized(_get(client, _token(key, **overrides)))


def test_other_key_with_known_kid_is_401(client: TestClient) -> None:
    other = ec.generate_private_key(ec.SECP256R1())

    _assert_unauthorized(_get(client, _token(other)))


def test_unknown_kid_is_401(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    _assert_unauthorized(_get(client, _token(key, kid="other-kid")))


def test_hs256_forged_with_public_key_is_401(
    client: TestClient, key: ec.EllipticCurvePrivateKey
) -> None:
    _assert_unauthorized(_get(client, _forged("HS256", key)))


def test_alg_none_is_401(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    _assert_unauthorized(_get(client, _forged("none", key)))


def test_corrupted_signature_is_401(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    head, payload, signature = _token(key).split(".")
    flipped = ("A" if signature[0] != "A" else "B") + signature[1:]

    _assert_unauthorized(_get(client, f"{head}.{payload}.{flipped}"))


def test_garbage_token_is_401(client: TestClient) -> None:
    _assert_unauthorized(_get(client, "not.a.jwt"))


def test_unreachable_jwks_is_503(
    client: TestClient, key: ec.EllipticCurvePrivateKey, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(self: PyJWKClient) -> dict[str, Any]:
        raise OSError("connection refused")

    monkeypatch.setattr(PyJWKClient, "fetch_data", boom)

    response = _get(client, _token(key))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "auth_unavailable"
    assert "connection refused" not in response.text


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
