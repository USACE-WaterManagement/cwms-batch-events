"""Local-only PostgreSQL and process lifecycle checks; never run against production."""

import asyncio
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from cwms_batch_events.api.routers import document_scan as scan
from cwms_batch_events.core.auth.user.models import User

OWNER = "local-lifecycle-fixture"


def reserve():
    scan_id = uuid.uuid4()
    scan.query(
        "INSERT INTO document_scans (id,owner,office,status) VALUES (:id,:owner,'SWT','receiving')",
        id=scan_id,
        owner=OWNER,
    )
    fd = os.memfd_create("synthetic-test", os.MFD_CLOEXEC)
    os.write(fd, b"%PDF-intentionally-invalid")
    return scan_id, fd


def assert_closed(fd):
    try:
        os.fstat(fd)
    except OSError:
        return
    raise AssertionError("Input descriptor was not closed")


async def main():
    assert (
        os.environ.get("PGHOST") == "reports"
    ), "Use only the isolated compose fixture"
    user = User(
        username=OWNER, offices=["SWT"], admin_offices=[], roles={"SWT": ["CWMS Users"]}
    )
    expired = uuid.uuid4()
    scan.query(
        """INSERT INTO document_scans (id,owner,office,status,expires_at)
        VALUES (:id,:owner,'SWT','completed',CURRENT_TIMESTAMP - INTERVAL '1 second')""",
        id=expired,
        owner=OWNER,
    )
    assert await scan.list_scans(user) == []
    try:
        await scan.get_scan(expired, user)
    except HTTPException as error:
        assert error.status_code == 404
    else:
        raise AssertionError("Expired report was readable")
    scan.cleanup()
    assert not scan.query("SELECT id FROM document_scans WHERE id=:id", id=expired)

    interrupted, fd = reserve()
    os.close(fd)
    scan.query(
        "UPDATE document_scans SET deadline=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=:id",
        id=interrupted,
    )
    scan.cleanup()
    assert (await scan.get_scan(interrupted, user))["status"] == "failed"

    invalid, fd = reserve()
    await scan.run_scan(invalid, fd)
    assert (await scan.get_scan(invalid, user))["status"] == "failed"
    assert_closed(fd)

    cancelled, fd = reserve()
    original_spawn = asyncio.create_subprocess_exec
    children = []

    async def slow_scanner(*args, **kwargs):
        child = await original_spawn(
            sys.executable, "-c", "import time; time.sleep(600)", **kwargs
        )
        children.append(child)
        return child

    with patch.object(asyncio, "create_subprocess_exec", slow_scanner):
        task = asyncio.create_task(scan.run_scan(cancelled, fd))
        while not children:
            await asyncio.sleep(0.01)
        task.cancel()
        await task
    assert children[0].returncode is not None
    assert_closed(fd)
    assert (await scan.get_scan(cancelled, user))["status"] == "failed"
    timed_out, fd = reserve()
    with patch.object(asyncio, "create_subprocess_exec", slow_scanner), patch.object(
        scan, "SCAN_TIMEOUT_SECONDS", 0.2
    ):
        await scan.run_scan(timed_out, fd)
    assert children[-1].returncode is not None
    assert_closed(fd)
    assert (await scan.get_scan(timed_out, user))["status"] == "failed"
    real_cancel, fd = reserve()
    supervised = []

    async def capture_scanner(*args, **kwargs):
        child = await original_spawn(*args, **kwargs)
        supervised.append(child)
        return child

    with patch.object(asyncio, "create_subprocess_exec", capture_scanner):
        task = asyncio.create_task(scan.run_scan(real_cancel, fd))
        java_pids = []
        for _ in range(300):
            if supervised:
                child_file = Path(
                    f"/proc/{supervised[0].pid}/task/{supervised[0].pid}/children"
                )
                if child_file.exists():
                    java_pids = child_file.read_text().split()
                    if java_pids:
                        break
            await asyncio.sleep(0.01)
        assert java_pids, "The real Java child did not start"
        task.cancel()
        await task
    for pid in java_pids:
        for _ in range(100):
            stat = Path(f"/proc/{pid}/stat")
            if not stat.exists() or stat.read_text().split()[2] == "Z":
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("Java survived watchdog cancellation")
    assert_closed(fd)
    scan.query("DELETE FROM document_scans WHERE owner=:owner", owner=OWNER)
    print(
        "PASS: expiry hidden/deleted, interrupted scan recovery, malformed PDF failure, cancellation and timeout kill child and close input"
    )


if __name__ == "__main__":
    asyncio.run(main())
