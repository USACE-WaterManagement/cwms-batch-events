"""SWT PDF pilot. Documents exist only in Linux anonymous memory descriptors."""

import asyncio
import contextlib
import ctypes
import hashlib
import ipaddress
import json
import os
import signal
import socket
import ssl
import sys
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from python_multipart import MultipartParser
from python_multipart.multipart import parse_options_header
from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from urllib3 import HTTPSConnectionPool

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.job_database.postgres.session import db_url
from cwms_batch_events.core.settings import settings

router = APIRouter(prefix="/document/scan", tags=["Document scans"])
MAX_BYTES = 10 * 1024 * 1024
MAX_OUTPUT = 256 * 1024
SCAN_TIMEOUT_SECONDS = 120
tasks: set[asyncio.Task] = set()
report_engine = create_engine(
    db_url, connect_args={"connect_timeout": 5, "options": "-c statement_timeout=5000"}
)
API_WORKER_PID = os.getpid()
PRCTL = ctypes.CDLL(None).prctl if hasattr(os, "memfd_create") else None


def query(statement, **params):
    with Session(report_engine) as db:
        result = db.execute(text(statement), params)
        rows = [dict(row) for row in result.mappings()] if result.returns_rows else []
        db.commit()
        return rows


def cleanup():
    query(
        """UPDATE document_scans SET status='failed', error='Scan interrupted. Please submit again.',
        expires_at=CURRENT_TIMESTAMP + INTERVAL '24 hours'
        WHERE status IN ('receiving','running') AND deadline < CURRENT_TIMESTAMP"""
    )
    query("DELETE FROM document_scans WHERE expires_at <= CURRENT_TIMESTAMP")


async def maintenance():
    while True:
        try:
            await asyncio.to_thread(cleanup)
        except Exception:
            # Never log request bodies, URLs, filenames, or scanner diagnostics.
            import logging

            logging.getLogger(__name__).error("Document scan report cleanup failed")
        await asyncio.sleep(900)


@contextlib.asynccontextmanager
async def lifespan(_app):
    if settings.document_scan_enabled and hasattr(os, "memfd_create"):
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
        for task in list(tasks):
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


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


def fetch_pdf(url, fd):
    """Exact configured hosts, public addresses, pinned TLS, no redirects/credentials."""
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        if (
            parsed.scheme != "https"
            or not host
            or parsed.port not in (None, 443)
            or parsed.username
            or parsed.password
            or parsed.fragment
            or host.lower() not in {h.lower() for h in settings.document_scan_url_hosts}
        ):
            raise ValueError()
        addresses = {
            row[4][0] for row in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        }
        if not addresses or any(
            not ipaddress.ip_address(a).is_global
            or ipaddress.ip_address(a).is_multicast
            or ipaddress.ip_address(a).is_reserved
            for a in addresses
        ):
            raise ValueError()
    except (ValueError, OSError):
        raise failure(400, "Use a public HTTPS PDF URL from an approved host") from None
    # Connect directly to the address we validated, but verify the original host.
    with HTTPSConnectionPool(
        sorted(addresses)[0],
        port=443,
        server_hostname=host,
        assert_hostname=host,
        cert_reqs=ssl.CERT_REQUIRED,
        timeout=10,
        retries=False,
    ) as pool:
        with pool.urlopen(
            "GET",
            parsed.path + ("?" + parsed.query if parsed.query else ""),
            headers={
                "Host": host,
                "Accept": "application/pdf",
                "Accept-Encoding": "identity",
            },
            preload_content=False,
            redirect=False,
        ) as remote:
            if remote.status != 200:
                raise failure(
                    400, "Document URL must return a PDF directly without redirects"
                )
            if remote.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise failure(400, "Compressed HTTP responses are not supported")
            for chunk in remote.stream(64 * 1024, decode_content=False):
                append_pdf(fd, chunk)


def child_setup(expected_parent=API_WORKER_PID):
    # Kill the scanner if its API worker dies. No source survives worker loss.
    import resource

    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if PRCTL(1, signal.SIGKILL) != 0 or os.getppid() != expected_parent:
        os._exit(1)


async def bounded_read(stream):
    output = bytearray()
    while chunk := await stream.read(8192):
        output.extend(chunk)
        if len(output) > MAX_OUTPUT:
            raise ValueError("Scanner output limit")
    return bytes(output)


async def run_scan(scan_id, fd):
    process = None
    try:
        admitted = query(
            """UPDATE document_scans SET status='running',
                deadline=CURRENT_TIMESTAMP + INTERVAL '3 minutes'
            WHERE id=:id AND status='receiving' AND deadline > CURRENT_TIMESTAMP
            RETURNING id""",
            id=scan_id,
        )
        if not admitted:
            raise ValueError("Scan admission expired")
        async with asyncio.timeout(SCAN_TIMEOUT_SECONDS):
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "cwms_batch_events.core.document_worker",
                str(os.getpid()),
                settings.document_scan_classpath,
                f"/proc/{os.getpid()}/fd/{fd}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                preexec_fn=child_setup,
            )
            output = await bounded_read(process.stdout)
            code = await process.wait()
            if code:
                raise ValueError("Scanner failed")
            report = json.loads(output)
            if report["end_status"] != "normal":
                raise ValueError("Scan incomplete")
            findings = report["findings"]
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
            query(
                """UPDATE document_scans SET status='completed', result=CAST(:result AS jsonb),
                expires_at=CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id=:id AND status='running'""",
                id=scan_id,
                result=json.dumps(report),
            )
    except (Exception, asyncio.CancelledError):
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        query(
            """UPDATE document_scans SET status='failed', error=:error,
            expires_at=CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id=:id""",
            id=scan_id,
            error="Unable to complete this PDF scan. The PDF may be encrypted, damaged, or exceed scanner limits.",
        )
    finally:
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        os.close(fd)


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
        raise failure(503, "Scanning requires the Linux scanner runtime")
    cleanup()
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
    handed_off = False
    try:
        import fcntl

        fd = os.memfd_create("document-scan", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
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
                if not isinstance(url, str):
                    raise failure(400, "Provide a document URL")
                child = await asyncio.create_subprocess_exec(
                    sys.executable,
                    "-m",
                    "cwms_batch_events.core.document_fetch",
                    str(fd),
                    str(os.getpid()),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                    pass_fds=(fd,),
                )
                try:
                    await child.communicate(url.encode("utf-8"))
                    if child.returncode == 13:
                        raise failure(413, "PDF must be 10 MiB or smaller")
                    if child.returncode:
                        raise failure(
                            400,
                            "Could not fetch a PDF from this approved public HTTPS URL",
                        )
                finally:
                    if child.returncode is None:
                        child.kill()
                        await child.wait()
            else:
                await receive_upload(request, fd)
        size = os.lseek(fd, 0, os.SEEK_END)
        os.lseek(fd, 0, os.SEEK_SET)
        if os.read(fd, 5) != b"%PDF-":
            raise failure(415, "Submit a PDF document")
        os.lseek(fd, 0, os.SEEK_SET)
        digest = hashlib.sha256()
        while chunk := os.read(fd, 64 * 1024):
            digest.update(chunk)
        fcntl.fcntl(
            fd,
            fcntl.F_ADD_SEALS,
            fcntl.F_SEAL_WRITE
            | fcntl.F_SEAL_GROW
            | fcntl.F_SEAL_SHRINK
            | fcntl.F_SEAL_SEAL,
        )
        query(
            "UPDATE document_scans SET sha256=:sha,size_bytes=:size WHERE id=:id",
            id=scan_id,
            sha=digest.hexdigest(),
            size=size,
        )
        task = asyncio.create_task(run_scan(scan_id, fd))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
        handed_off = True
        return {"id": str(scan_id), "status": "receiving"}
    except TimeoutError:
        raise failure(408, "Receiving the PDF exceeded 30 seconds") from None
    except HTTPException:
        raise
    except Exception:
        raise failure(400, "Unable to read the PDF request") from None
    finally:
        if not handed_off:
            if fd is not None:
                os.close(fd)
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
