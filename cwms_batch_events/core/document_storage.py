"""Private, unversioned scan staging. Never fall back to a web or log bucket."""

import boto3
from botocore.config import Config
from cwms_batch_events.core.settings import settings


def prefix(scan_id):
    from uuid import UUID

    return f"document-scans/swt/{UUID(str(scan_id))}/"


def storage():
    if not settings.document_scan_bucket:
        raise ValueError("Private scan bucket is not configured")
    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        config=Config(
            connect_timeout=5, read_timeout=15, retries={"total_max_attempts": 1}
        ),
    )
    block = client.get_public_access_block(Bucket=settings.document_scan_bucket)[
        "PublicAccessBlockConfiguration"
    ]
    if not all(
        block.get(k)
        for k in (
            "BlockPublicAcls",
            "IgnorePublicAcls",
            "BlockPublicPolicy",
            "RestrictPublicBuckets",
        )
    ):
        raise ValueError("Scan bucket must block all public access")
    if client.get_bucket_versioning(Bucket=settings.document_scan_bucket).get("Status"):
        raise ValueError(
            "Scan bucket must be unversioned so deletion removes the source"
        )
    rules = client.get_bucket_lifecycle_configuration(
        Bucket=settings.document_scan_bucket
    ).get("Rules", [])
    if not any(
        rule.get("Status") == "Enabled"
        and rule.get("Filter") == {"Prefix": "document-scans/"}
        and 0 < rule.get("Expiration", {}).get("Days", 0) <= 1
        for rule in rules
    ):
        raise ValueError("Scan staging requires a one-day expiration backstop")
    return client


def erase(client, scan_id, include_result=True):
    names = ["input.pdf", "request.json", "claim.json"]
    if include_result:
        names.append("result.json")
    for name in names:
        client.delete_object(
            Bucket=settings.document_scan_bucket, Key=prefix(scan_id) + name
        )
