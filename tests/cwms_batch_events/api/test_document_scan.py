import asyncio
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from cwms_batch_events.api.routers import document_scan as scan


@pytest.mark.parametrize(
    "url",
    [
        "http://www.w3.org/test.pdf",
        "https://user:pass@www.w3.org/a.pdf",
        "https://www.w3.org:8443/a.pdf",
        "https://unapproved.example/a.pdf",
        "https://www.w3.org/a.pdf#fragment",
        "file:///etc/passwd",
    ],
)
def test_url_rejects_unsupported_targets_before_dns(monkeypatch, url):
    monkeypatch.setattr(scan.settings, "document_scan_url_hosts", ["www.w3.org"])
    with patch.object(scan.socket, "getaddrinfo") as dns:
        with pytest.raises(HTTPException):
            scan.fetch_pdf(url, -1)
        dns.assert_not_called()


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "::1",
        "::ffff:127.0.0.1",
        "100.64.0.1",
        "224.0.0.1",
    ],
)
def test_url_rejects_private_dns_even_with_public_answer(monkeypatch, address):
    monkeypatch.setattr(scan.settings, "document_scan_url_hosts", ["www.w3.org"])
    answers = [(2, 1, 6, "", (a, 443)) for a in ["8.8.8.8", address]]
    with patch.object(scan.socket, "getaddrinfo", return_value=answers), patch.object(
        scan, "HTTPSConnectionPool"
    ) as pool:
        with pytest.raises(HTTPException):
            scan.fetch_pdf("https://www.w3.org/a.pdf", -1)
        pool.assert_not_called()


def test_url_pins_dns_and_does_not_follow_redirects(monkeypatch):
    monkeypatch.setattr(scan.settings, "document_scan_url_hosts", ["www.w3.org"])
    answers = [(2, 1, 6, "", ("8.8.8.8", 443))]
    with patch.object(scan.socket, "getaddrinfo", return_value=answers), patch.object(
        scan, "HTTPSConnectionPool"
    ) as pool:
        response = (
            pool.return_value.__enter__.return_value.urlopen.return_value.__enter__.return_value
        )
        response.status = 302
        with pytest.raises(HTTPException):
            scan.fetch_pdf("https://www.w3.org/a.pdf", -1)
        assert pool.call_args.args[0] == "8.8.8.8"
        assert pool.call_args.kwargs["assert_hostname"] == "www.w3.org"
        assert (
            pool.return_value.__enter__.return_value.urlopen.call_args.kwargs[
                "redirect"
            ]
            is False
        )


@pytest.mark.skipif(not hasattr(os, "memfd_create"), reason="Linux memory descriptor")
def test_upload_stream_has_no_temporary_file():
    body = b'--sample\r\nContent-Disposition: form-data; name="file"; filename="private.pdf"\r\n\r\n%PDF-test\r\n--sample--\r\n'

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    request = Request(
        {
            "type": "http",
            "headers": [(b"content-type", b"multipart/form-data; boundary=sample")],
        },
        receive,
    )
    fd = os.memfd_create("test", os.MFD_CLOEXEC)
    try:
        asyncio.run(scan.receive_upload(request, fd))
        os.lseek(fd, 0, os.SEEK_SET)
        assert os.read(fd, 100) == b"%PDF-test"
        assert "memfd:" in os.readlink(f"/proc/self/fd/{fd}")
    finally:
        os.close(fd)


def test_output_limit_stops_unbounded_reports():
    async def check():
        stream = asyncio.StreamReader()
        stream.feed_data(b"x" * (scan.MAX_OUTPUT + 1))
        stream.feed_eof()
        with pytest.raises(ValueError):
            await scan.bounded_read(stream)

    asyncio.run(check())
