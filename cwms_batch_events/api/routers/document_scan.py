"""SWT Batch scan coordination with private temporary S3 staging."""

import asyncio
import contextlib
import hashlib
import json
import os
import re
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from python_multipart import MultipartParser
from python_multipart.multipart import parse_options_header
from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import db_url
from cwms_batch_events.core.settings import settings
from cwms_batch_events.core.document_storage import storage, prefix, erase
from cwms_batch_events.core.queue import JobQueue
from cwms_batch_events.core.models import ScriptRunOptions, JobSource
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/document/scan", tags=["Document scans"])
MAX_BYTES = 10 * 1024 * 1024
MAX_OUTPUT = 256 * 1024
report_engine = create_engine(
    db_url, connect_args={"connect_timeout": 5, "options": "-c statement_timeout=5000"}
)


def query(statement, **params):
    with Session(report_engine) as db:
        result = db.execute(text(statement), params)
        rows = [dict(row) for row in result.mappings()] if result.returns_rows else []
        db.commit()
        return rows


def summarize(report):
    findings = report["findings"]
    if (
        report.get("end_status") != "normal"
        or report.get("profile") != "PDF/UA-1"
        or not isinstance(report.get("compliant"), bool)
        or len(findings) > 2000
    ):
        raise ValueError("Invalid result")
    findings = [
        {
            "clause": row["clause"],
            "test": row["test"],
            "count": row["count"],
            "description": row["description"],
        }
        for row in findings
    ]
    for row in findings:
        if (
            not isinstance(row["clause"], str)
            or not re.fullmatch(r"[0-9.]{1,40}", row["clause"])
            or type(row["test"]) is not int
            or not 0 < row["test"] < 100000
            or type(row["count"]) is not int
            or not 0 < row["count"] < 100000000
            or not isinstance(row["description"], str)
            or len(row["description"]) > 8192
        ):
            raise ValueError("Invalid finding")
    report = {
        "findings": findings,
        "profile": "PDF/UA-1",
        "end_status": "normal",
        "compliant": report["compliant"],
    }
    report["failed_rules"] = len(findings)
    report["failed_checks"] = sum(row["count"] for row in findings)
    report["summary"] = (
        f"Automated PDF/UA-1 checks found {len(findings)} failed rules across "
        f"{report['failed_checks']} checks."
        if findings
        else "No failures were found by the automated PDF/UA-1 checks."
    )
    priorities = set()
    for finding in findings:
        clause, test = finding["clause"], finding["test"]
        if clause == "6.2" or (clause == "7.1" and test in (3, 11)):
            priorities.add("Add document tags and check reading order.")
        if clause == "7.2":
            priorities.add("Set the document and text language.")
        if clause.startswith("7.21"):
            priorities.add("Review fonts and embed the required font programs.")
        if clause == "7.1" and test in (8, 10):
            priorities.add("Review document metadata and title display.")
    report["priorities"] = sorted(priorities)
    report["manual_review"] = (
        "Review reading order, alternative text quality, contrast, and keyboard use. Automated checks do not certify Section 508 compliance."
    )
    return report


def cleanup():
    from botocore.exceptions import ClientError

    client = storage()
    rows = query(
        """SELECT * FROM document_scans WHERE NOT storage_cleaned
        OR expires_at <= CURRENT_TIMESTAMP"""
    )
    for row in rows:
        key = prefix(row["id"])
        terminal = row["status"] in ("completed", "failed")
        overdue = row["deadline"] < datetime.now(timezone.utc)
        if not terminal and row["status"] == "running":
            try:
                response = client.get_object(
                    Bucket=settings.document_scan_bucket, Key=key + "result.json"
                )
                with response["Body"] as body:
                    data = body.read(MAX_OUTPUT + 1)
                if len(data) > MAX_OUTPUT:
                    raise ValueError("Result exceeds limit")
                outcome = json.loads(data)
                if outcome["status"] not in ("completed", "failed"):
                    raise ValueError("Invalid outcome")
                if outcome["status"] == "completed" and (
                    not re.fullmatch(r"[0-9a-f]{64}", outcome.get("sha256", ""))
                    or type(outcome.get("size_bytes")) is not int
                    or not 0 < outcome["size_bytes"] <= MAX_BYTES
                ):
                    raise ValueError("Invalid document metadata")
                result = (
                    summarize(outcome["result"])
                    if outcome["status"] == "completed"
                    else None
                )
                # Delete the source before exposing a terminal result. Retry on failure.
                erase(client, row["id"], include_result=False)
                query(
                    """UPDATE document_scans SET status=:status,result=CAST(:result AS jsonb),
                    error=:error,sha256=COALESCE(:sha,sha256),size_bytes=COALESCE(:size,size_bytes),
                    expires_at=CURRENT_TIMESTAMP + INTERVAL '24 hours'
                    WHERE id=:id AND status='running'""",
                    id=row["id"],
                    status="completed" if result else "failed",
                    result=json.dumps(result),
                    error=None if result else "Unable to complete this PDF scan.",
                    sha=outcome.get("sha256"),
                    size=outcome.get("size_bytes"),
                )
                terminal = True
            except ClientError as exc:
                if exc.response["Error"]["Code"] not in ("NoSuchKey", "404"):
                    raise
            except (ValueError, KeyError, TypeError):
                overdue = True  # Malformed runner output cannot retain its source indefinitely.
        if terminal or overdue:
            erase(client, row["id"])
            query(
                """UPDATE document_scans SET storage_cleaned=true,
                status=CASE WHEN status IN ('receiving','running') THEN 'failed' ELSE status END,
                error=CASE WHEN status IN ('receiving','running') THEN 'Scan expired or was interrupted. Please submit again.' ELSE error END,
                expires_at=COALESCE(expires_at,CURRENT_TIMESTAMP + INTERVAL '24 hours') WHERE id=:id""",
                id=row["id"],
            )
    query(
        "DELETE FROM document_scans WHERE storage_cleaned AND expires_at <= CURRENT_TIMESTAMP"
    )


async def maintenance():
    while True:
        try:
            await asyncio.to_thread(cleanup)
        except Exception:
            import logging

            logging.getLogger(__name__).error(
                "Document scan storage reconciliation failed"
            )
        await asyncio.sleep(10)


@contextlib.asynccontextmanager
async def lifespan(_app):
    if settings.document_scan_enabled and hasattr(os, 'memfd_create'):
        import resource
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    worker = (
        asyncio.create_task(maintenance()) if settings.document_scan_enabled else None
    )
    try:
        yield
    finally:
        if worker:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)


async def scan_user(response: Response, user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    if not settings.document_scan_enabled:
        raise HTTPException(
            503,
            "Document scanning is not enabled",
            headers={"Cache-Control": "no-store"},
        )
    if "SWT" not in user.offices:
        raise HTTPException(
            403,
            "SWT CWMS Users access is required",
            headers={"Cache-Control": "no-store"},
        )
    return user


def failure(status, message):
    return HTTPException(status, message, headers={"Cache-Control": "no-store"})


def append_pdf(fd, data):
    if os.lseek(fd, 0, os.SEEK_CUR) + len(data) > MAX_BYTES:
        raise failure(413, "PDF must be 10 MiB or smaller")
    os.write(fd, data)


async def receive_upload(request, fd):
    media, options = parse_options_header(request.headers.get("content-type", ""))
    if media != b"multipart/form-data" or b"boundary" not in options:
        raise failure(415, "Use a PDF form upload or a JSON document URL")
    if len(options[b"boundary"]) > 200:
        raise failure(400, "Upload boundary is too long")
    header_name = bytearray()
    header_value = bytearray()
    headers = {}
    part_count = 0
    ended = False
    header_bytes = 0

    def part_begin():
        nonlocal part_count
        part_count += 1
        if part_count != 1:
            raise failure(400, "Submit exactly one file field")

    def header_field(data, start, end):
        nonlocal header_bytes
        header_bytes += end - start
        if header_bytes > 4096:
            raise failure(400, "Upload headers are too large")
        header_name.extend(data[start:end])

    def header_data(data, start, end):
        nonlocal header_bytes
        header_bytes += end - start
        if header_bytes > 4096:
            raise failure(400, "Upload headers are too large")
        header_value.extend(data[start:end])

    def header_end():
        headers[bytes(header_name).lower()] = bytes(header_value)
        header_name.clear()
        header_value.clear()

    def headers_finished():
        _, disposition = parse_options_header(headers.get(b"content-disposition", b""))
        if disposition.get(b"name") != b"file" or b"filename" not in disposition:
            raise failure(400, "Submit a PDF using the file field")

    def end():
        nonlocal ended
        ended = True

    parser = MultipartParser(
        options[b"boundary"],
        {
            "on_part_begin": part_begin,
            "on_header_field": header_field,
            "on_header_value": header_data,
            "on_header_end": header_end,
            "on_headers_finished": headers_finished,
            "on_part_data": lambda data, start, end: append_pdf(fd, data[start:end]),
            "on_end": end,
        },
    )
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_BYTES + 8192:
            raise failure(413, "PDF must be 10 MiB or smaller")
        parser.write(chunk)
    parser.finalize()
    if not ended or part_count != 1:
        raise failure(400, "Incomplete PDF upload")


@router.post(
    "",
    status_code=202,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {
                            "file": {
                                "type": "string",
                                "format": "binary",
                                "description": "One PDF, maximum 10 MiB",
                            }
                        },
                    }
                },
                "application/json": {
                    "schema": {
                        "type": "object",
                        "required": ["url"],
                        "properties": {
                            "url": {
                                "type": "string",
                                "format": "uri",
                                "description": "Direct public HTTPS PDF on an approved host",
                            }
                        },
                    }
                },
            },
        }
    },
)
async def create_scan(request: Request, user: User = Depends(scan_user)):
    if not hasattr(os, "memfd_create"):
        raise failure(503, "Uploads require the Linux API runtime")
    try:
        client = await asyncio.to_thread(storage)
    except Exception:
        raise failure(503, "Private scan staging is unavailable") from None
    await asyncio.to_thread(cleanup)
    scan_id = uuid.uuid4()
    try:
        query(
            "INSERT INTO document_scans (id,owner,office,status) VALUES (:id,:owner,'SWT','receiving')",
            id=scan_id,
            owner=user.username,
        )
    except IntegrityError:
        raise failure(
            429, "A scan is already in progress. Please try again shortly."
        ) from None
    fd = None
    submitted = False
    submission_attempted = False
    key = prefix(scan_id)
    try:
        manifest = {
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        }
        async with asyncio.timeout(30):
            if (
                request.headers.get("content-type", "").split(";")[0]
                == "application/json"
            ):
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > 4096:
                        raise failure(413, "Document URL request is too large")
                data = json.loads(body)
                url = data.get("url") if isinstance(data, dict) else None
                parsed = urlsplit(url) if isinstance(url, str) else None
                if (
                    not parsed
                    or parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.hostname.lower()
                    not in {h.lower() for h in settings.document_scan_url_hosts}
                    or parsed.port not in (None, 443)
                    or parsed.username
                    or parsed.password
                    or parsed.fragment
                ):
                    raise failure(
                        400, "Use a public HTTPS PDF URL from an approved host"
                    )
                manifest.update(url=url, allowed_hosts=[parsed.hostname])
            else:
                fd = os.memfd_create("document-upload", os.MFD_CLOEXEC)
                await receive_upload(request, fd)
                size = os.lseek(fd, 0, os.SEEK_END)
                os.lseek(fd, 0, os.SEEK_SET)
                if os.read(fd, 5) != b"%PDF-":
                    raise failure(415, "Submit a PDF document")
                os.lseek(fd, 0, os.SEEK_SET)
                digest = hashlib.sha256()
                while chunk := os.read(fd, 65536):
                    digest.update(chunk)
                query(
                    "UPDATE document_scans SET sha256=:sha,size_bytes=:size WHERE id=:id",
                    id=scan_id,
                    sha=digest.hexdigest(),
                    size=size,
                )
                os.lseek(fd, 0, os.SEEK_SET)
                # Synchronous bounded SDK transfer keeps descriptor lifetime deterministic.
                with os.fdopen(os.dup(fd), "rb") as source:
                    client.put_object(
                        Bucket=settings.document_scan_bucket,
                        Key=key + "input.pdf",
                        Body=source,
                        ServerSideEncryption="AES256",
                    )
        client.put_object(
            Bucket=settings.document_scan_bucket,
            Key=key + "request.json",
            Body=json.dumps(manifest).encode(),
            ServerSideEncryption="AES256",
        )
        query(
            "UPDATE document_scans SET status='running',deadline=CURRENT_TIMESTAMP + INTERVAL '1 hour' WHERE id=:id",
            id=scan_id,
        )
        queue = JobQueue()
        options = ScriptRunOptions(
            office="swt",
            repo_path="/opt/document-scan/venv/bin/python",
            script_slug="document-scan",
            execution_type="command",
            runtime="python",
            command_args=[
                "/opt/document-scan/run.py",
                "--scan-id",
                str(scan_id),
                "--bucket",
                settings.document_scan_bucket,
            ],
        )
        message = queue.create_job_message(
            scan_id, user.username, JobSource.API, options
        )
        message.document_scan = True
        submission_attempted = True
        # Do not retry a mutation after an ambiguous response. Reconciliation expires it.
        queue.send_job_message(message)
        submitted = True
        return {"id": str(scan_id), "status": "running"}
    except TimeoutError:
        raise failure(408, "Receiving the PDF exceeded 30 seconds") from None
    except HTTPException:
        raise
    except Exception:
        raise failure(
            503 if submission_attempted else 400,
            "Unable to submit this PDF scan. Refresh the scan list before retrying.",
        ) from None
    finally:
        if fd is not None:
            os.close(fd)
        if not submitted and not submission_attempted:
            erase(client, scan_id)
            query("DELETE FROM document_scans WHERE id=:id", id=scan_id)


SELECT_REPORT = """SELECT id,status,sha256,size_bytes,created_at,expires_at,result,error
    FROM document_scans WHERE owner=:owner AND office='SWT'
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)"""


@router.get("")
async def list_scans(user: User = Depends(scan_user)):
    return query(
        SELECT_REPORT + " ORDER BY created_at DESC LIMIT 100", owner=user.username
    )


@router.get("/{scan_id}")
async def get_scan(scan_id: uuid.UUID, user: User = Depends(scan_user)):
    rows = query(SELECT_REPORT + " AND id=:id", owner=user.username, id=scan_id)
    if not rows:
        raise failure(404, "Scan not found")
    return rows[0]
