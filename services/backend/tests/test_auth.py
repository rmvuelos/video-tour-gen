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
        {"role": "anon"},
        {"role": "service_role"},
        {"role": None},
        {"iat": None},
        {"is_anonymous": True},
        {"nbf": int(time.time()) + 3600},
        {"iat": int(time.time()) + 3600},
        {"exp": int(time.time()) - 30},
    ],
    ids=[
        "expired", "aud", "iss", "sub-not-uuid", "no-exp", "no-sub", "no-aud", "no-iss",
        "role-anon", "role-service", "no-role", "no-iat", "is-anonymous", "nbf-future",
        "iat-future", "past-leeway",
    ],
)
def test_bad_claims_are_401(
    client: TestClient, key: ec.EllipticCurvePrivateKey, overrides: dict[str, Any]
) -> None:
    _assert_unauthorized(_get(client, _token(key, **overrides)))


def test_exp_within_leeway_passes(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    assert _get(client, _token(key, exp=int(time.time()) - 5)).status_code == 200


def test_non_anonymous_flag_passes(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    assert _get(client, _token(key, is_anonymous=False)).status_code == 200


def test_es384_token_with_known_kid_is_401(client: TestClient) -> None:
    other = ec.generate_private_key(ec.SECP384R1())

    _assert_unauthorized(_get(client, _token(other, alg="ES384")))


def test_bearer_with_extra_part_is_401(client: TestClient, key: ec.EllipticCurvePrivateKey) -> None:
    _assert_unauthorized(client.get("/me", headers={"Authorization": f"Bearer {_token(key)} a"}))


def test_jku_and_x5u_headers_are_ignored(
    client: TestClient, key: ec.EllipticCurvePrivateKey, monkeypatch: pytest.MonkeyPatch
) -> None:
    uris: list[str] = []

    def fetch(self: PyJWKClient) -> dict[str, Any]:
        uris.append(self.uri)
        return _jwks(key)

    monkeypatch.setattr(PyJWKClient, "fetch_data", fetch)
    headers = {"jku": "http://evil.test/jwks", "x5u": "http://evil.test/cert"}

    assert _get(client, _token(key, headers=headers)).status_code == 200
    assert uris == ["http://supabase.test/jwks"]


def test_unknown_kid_floods_cause_at_most_two_fetches(
    client: TestClient, key: ec.EllipticCurvePrivateKey, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[int] = []

    def fetch(self: PyJWKClient) -> dict[str, Any]:
        calls.append(1)
        return _jwks(key)

    monkeypatch.setattr(PyJWKClient, "fetch_data", fetch)
    for _ in range(10):
        _assert_unauthorized(_get(client, _token(key, kid="nope")))

    assert len(calls) <= 2


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


def _assert_unavailable(response: Any, secret: str) -> None:
    assert response.status_code == 503
    assert "www-authenticate" not in response.headers
    assert response.json()["error"]["code"] == "auth_unavailable"
    assert secret not in response.text


def _broken_fetch(exc: Exception) -> Any:
    def fetch(self: PyJWKClient) -> dict[str, Any]:
        raise exc

    return fetch


@pytest.mark.parametrize(
    "exc",
    [
        jwt.PyJWKClientConnectionError("connection refused"),
        json.JSONDecodeError("bad json", "{", 0),
    ],
    ids=["unreachable", "invalid-json"],
)
def test_jwks_failures_are_503(
    client: TestClient,
    key: ec.EllipticCurvePrivateKey,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    exc: Exception,
) -> None:
    monkeypatch.setattr(PyJWKClient, "fetch_data", _broken_fetch(exc))
    token = _token(key)

    with caplog.at_level(logging.DEBUG):
        response = _get(client, token)

    _assert_unavailable(response, "connection refused")
    assert token not in caplog.text


@pytest.mark.parametrize("jwks", [{"keys": []}, {"keys": [{"kty": "oct"}]}, []])
def test_jwks_without_signing_keys_is_503(
    client: TestClient, key: ec.EllipticCurvePrivateKey, monkeypatch: pytest.MonkeyPatch, jwks: Any
) -> None:
    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)

    _assert_unavailable(_get(client, _token(key)), "keys")


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
