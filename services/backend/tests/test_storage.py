import json

import httpx2 as httpx
import pytest

from app.errors import ApiError
from app.storage import StorageClient

PATH = "u1/p1/f1"


def make(handler: httpx.MockTransport | None = None) -> StorageClient:
    return StorageClient(
        "http://internal.test", "http://public.test", "secret-key", transport=handler
    )


def transport(status: int, body: object, calls: list[httpx.Request]) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, json=body)

    return httpx.MockTransport(handle)


def test_signed_upload_url_points_to_the_public_host_and_uses_the_service_key() -> None:
    calls: list[httpx.Request] = []
    body = {"url": f"/object/upload/sign/originals/{PATH}?token=t0k"}

    url = make(transport(200, body, calls)).signed_upload_url(PATH)

    assert url == f"http://public.test/storage/v1/object/upload/sign/originals/{PATH}?token=t0k"
    assert (
        str(calls[0].url) == f"http://internal.test/storage/v1/object/upload/sign/originals/{PATH}"
    )
    assert calls[0].headers["authorization"] == "Bearer secret-key"


def test_size_is_read_from_the_object_info() -> None:
    assert make(transport(200, {"size": 123}, [])).size(PATH) == 123


def test_size_of_a_missing_object_is_none() -> None:
    assert make(transport(404, {"error": "not_found"}, [])).size(PATH) is None


def test_delete_sends_the_exact_paths() -> None:
    calls: list[httpx.Request] = []

    make(transport(200, [], calls)).delete("originals", [PATH])

    assert calls[0].method == "DELETE"
    assert json.loads(calls[0].content) == {"prefixes": [PATH]}


def test_delete_prefix_lists_the_folder_then_deletes_what_it_finds() -> None:
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=[{"name": "a.jpg"}] if request.method == "POST" else [])

    make(httpx.MockTransport(handle)).delete_prefix("derived", "u1/p1/f1")

    assert json.loads(calls[1].content) == {"prefixes": ["u1/p1/f1/a.jpg"]}


def test_delete_prefix_of_an_empty_folder_deletes_nothing() -> None:
    calls: list[httpx.Request] = []

    make(transport(200, [], calls)).delete_prefix("derived", "u1/p1/f1")

    assert len(calls) == 1


def test_storage_failure_is_a_502_without_leaking_the_body() -> None:
    with pytest.raises(ApiError) as caught:
        make(transport(500, {"secret": "boom"}, [])).signed_upload_url(PATH)

    assert caught.value.status_code == 502
    assert "boom" not in caught.value.message


def test_unreachable_storage_is_a_502() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(ApiError) as caught:
        make(httpx.MockTransport(refuse)).size(PATH)

    assert caught.value.code == "storage_unavailable"


def test_only_a_404_body_inside_a_400_means_no_such_object() -> None:
    missing = make(transport(400, {"statusCode": "404", "error": "not_found"}, []))
    other = make(transport(400, {"statusCode": "400", "error": "Invalid key"}, []))

    assert missing.size(PATH) is None
    with pytest.raises(ApiError) as caught:
        other.size(PATH)
    assert caught.value.status_code == 502


@pytest.mark.parametrize("body", [{"nope": 1}, "not-an-object", {"size": "big"}])
def test_an_unexpected_success_body_is_a_502(body: object) -> None:
    with pytest.raises(ApiError) as caught:
        make(transport(200, body, [])).size(PATH)

    assert caught.value.code == "storage_unavailable"


def test_a_non_json_success_body_is_a_502() -> None:
    client = make(httpx.MockTransport(lambda request: httpx.Response(200, content=b"<html>")))

    with pytest.raises(ApiError) as caught:
        client.signed_upload_url(PATH)

    assert caught.value.status_code == 502


def test_timeouts_are_short_and_the_client_can_be_closed() -> None:
    client = make(transport(200, {}, []))

    assert client._http.timeout == httpx.Timeout(10, connect=3)
    client.close()
    assert client._http.is_closed


def test_download_returns_the_raw_bytes_and_none_when_missing() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        found = request.url.path.endswith(PATH)
        return httpx.Response(200, content=b"\x00raw") if found else httpx.Response(404)

    client = make(httpx.MockTransport(handle))

    assert client.download("originals", PATH, 100) == b"\x00raw"
    assert client.download("originals", "u1/p1/other", 100) is None


def test_upload_overwrites_so_a_retry_is_idempotent() -> None:
    calls: list[httpx.Request] = []

    make(transport(200, {}, calls)).upload("derived", f"{PATH}/main.jpg", b"jpg", "image/jpeg")

    assert calls[0].method == "POST"
    assert calls[0].url.path == f"/storage/v1/object/derived/{PATH}/main.jpg"
    assert calls[0].headers["x-upsert"] == "true"
    assert calls[0].headers["content-type"] == "image/jpeg"
    assert calls[0].content == b"jpg"


def test_download_stops_reading_one_byte_past_the_cap() -> None:
    client = make(httpx.MockTransport(lambda r: httpx.Response(200, content=b"x" * 100)))

    assert len(client.download("originals", PATH, 10) or b"") == 11


def test_download_failures_are_a_502() -> None:
    with pytest.raises(ApiError) as exc:
        make(transport(500, {}, [])).download("originals", PATH, 10)

    assert exc.value.status_code == 502
