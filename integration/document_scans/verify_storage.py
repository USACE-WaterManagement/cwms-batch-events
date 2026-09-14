"""Expiry and cleanup failure checks in the disposable compose fixture only."""

import asyncio
from datetime import datetime, timezone, timedelta
import json
import os
from unittest.mock import patch
import uuid
from cwms_batch_events.api.routers import document_scan as scan
from cwms_batch_events.core.auth.user.models import User

assert os.environ["PGHOST"] == "reports", "Use the isolated compose fixture only"
client = scan.storage()
bucket = scan.settings.document_scan_bucket
owner = "storage-lifecycle-test"
user = User(
    username=owner, offices=["SWT"], admin_offices=[], roles={"SWT": ["CWMS Users"]}
)


def reserve():
    scan_id = uuid.uuid4()
    scan.query(
        "INSERT INTO document_scans (id,owner,office,status) VALUES (:id,:owner,'SWT','running')",
        id=scan_id,
        owner=owner,
    )
    for name in ["input.pdf", "request.json", "claim.json"]:
        client.put_object(
            Bucket=bucket, Key=scan.prefix(scan_id) + name, Body=b"synthetic fixture"
        )
    return scan_id


scan_id = reserve()
scan.query(
    "UPDATE document_scans SET deadline=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=:id",
    id=scan_id,
)
with patch.object(scan, "erase", side_effect=RuntimeError("simulated deletion outage")):
    try:
        scan.cleanup()
    except RuntimeError:
        pass
assert (
    scan.query("SELECT status FROM document_scans WHERE id=:id", id=scan_id)[0][
        "status"
    ]
    == "running"
)
scan.cleanup()
assert scan.query(
    "SELECT status,storage_cleaned FROM document_scans WHERE id=:id", id=scan_id
)[0] == {"status": "failed", "storage_cleaned": True}
assert not client.list_objects_v2(Bucket=bucket, Prefix=scan.prefix(scan_id)).get(
    "Contents"
)
scan.query(
    "UPDATE document_scans SET expires_at=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=:id",
    id=scan_id,
)
assert asyncio.run(scan.list_scans(user)) == []
scan.cleanup()
assert not scan.query("SELECT id FROM document_scans WHERE id=:id", id=scan_id)
bad = reserve()
client.put_object(
    Bucket=bucket, Key=scan.prefix(bad) + "result.json", Body=b'{"status":"invalid"}'
)
scan.cleanup()
assert (
    scan.query("SELECT status FROM document_scans WHERE id=:id", id=bad)[0]["status"]
    == "failed"
)
assert not client.list_objects_v2(Bucket=bucket, Prefix=scan.prefix(bad)).get(
    "Contents"
)
scan.query("DELETE FROM document_scans WHERE owner=:owner", owner=owner)
print(
    "PASS: expiry hides/deletes reports, deletion outage retains cleanup responsibility, retry deletes staging, invalid result fails closed"
)
