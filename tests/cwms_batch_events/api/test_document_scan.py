import asyncio
import os
from unittest.mock import MagicMock, patch
import pytest
from starlette.requests import Request
from cwms_batch_events.api.routers import document_scan as scan
from cwms_batch_events.core import document_storage as storage


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


def test_private_bucket_required(monkeypatch):
    monkeypatch.setattr(storage.settings, "document_scan_bucket", "private-scans")
    client = MagicMock()
    with patch.object(storage.boto3, "client", return_value=client):
        client.get_public_access_block.return_value = {
            "PublicAccessBlockConfiguration": {}
        }
        with pytest.raises(ValueError):
            storage.storage()
        client.get_public_access_block.return_value = {
            "PublicAccessBlockConfiguration": dict.fromkeys(
                [
                    "BlockPublicAcls",
                    "IgnorePublicAcls",
                    "BlockPublicPolicy",
                    "RestrictPublicBuckets",
                ],
                True,
            )
        }
        client.get_bucket_versioning.return_value = {"Status": "Enabled"}
        with pytest.raises(ValueError):
            storage.storage()
        client.get_bucket_versioning.return_value = {}
        client.get_bucket_lifecycle_configuration.return_value = {"Rules": []}
        with pytest.raises(ValueError):
            storage.storage()
        client.get_bucket_lifecycle_configuration.return_value = {
            "Rules": [
                {
                    "Status": "Enabled",
                    "Filter": {"Prefix": "document-scans/"},
                    "Expiration": {"Days": 1},
                }
            ]
        }
        assert storage.storage() is client


def test_cleanup_targets_only_scan_objects(monkeypatch):
    monkeypatch.setattr(storage.settings, "document_scan_bucket", "private-scans")
    client = MagicMock()
    storage.erase(client, "00000000-0000-0000-0000-000000000001")
    assert {c.kwargs["Key"] for c in client.delete_object.call_args_list} == {
        "document-scans/swt/00000000-0000-0000-0000-000000000001/" + name
        for name in ["input.pdf", "request.json", "claim.json", "result.json"]
    }
    assert all(
        c.kwargs["Bucket"] == "private-scans"
        for c in client.delete_object.call_args_list
    )


def test_summary_counts():
    result = scan.summarize(
        {
            "end_status": "normal",
            "profile": "PDF/UA-1",
            "compliant": False,
            "findings": [
                {"clause": "7.2", "test": 34, "count": 2, "description": "Static rule"}
            ],
        }
    )
    assert result["failed_checks"] == 2
    assert result["priorities"] == ["Set the document and text language."]
