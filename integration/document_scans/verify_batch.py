"""Local SQS/S3 emulation with actual isolated district runner containers.

This is not AWS Batch/Fargate evidence. Never connect this harness to live AWS.
"""

import json
import subprocess
import sys
import threading
import time
import boto3
import verify_live as live

BUCKET = "private-document-scan-pilot"
credentials = dict(
    aws_access_key_id="local-test",
    aws_secret_access_key="local-test",
    region_name="us-east-1",
)
sqs = boto3.client("sqs", endpoint_url="http://localhost:18083", **credentials)
s3 = boto3.client("s3", endpoint_url="http://localhost:18083", **credentials)


def initialize():
    s3.create_bucket(Bucket=BUCKET)
    s3.put_public_access_block(
        Bucket=BUCKET,
        PublicAccessBlockConfiguration=dict.fromkeys(
            [
                "BlockPublicAcls",
                "IgnorePublicAcls",
                "BlockPublicPolicy",
                "RestrictPublicBuckets",
            ],
            True,
        ),
    )
    s3.put_bucket_lifecycle_configuration(
        Bucket=BUCKET,
        LifecycleConfiguration={
            "Rules": [
                {
                    "ID": "scan-staging-expiry",
                    "Status": "Enabled",
                    "Filter": {"Prefix": "document-scans/"},
                    "Expiration": {"Days": 1},
                }
            ]
        },
    )
    return sqs.create_queue(QueueName="cwms-batch-events")["QueueUrl"]


def runner(message):
    assert message["document_scan"] is True
    payload = message["payload"]
    assert payload["office"] == "swt" and payload["execution_type"] == "command"
    assert payload["repo_path"] == "/opt/document-scan/venv/bin/python"
    args = payload["command_args"]
    assert args == [
        "/opt/document-scan/run.py",
        "--scan-id",
        message["job_id"],
        "--bucket",
        BUCKET,
    ]
    assert "url" not in json.dumps(message).lower() and "%PDF" not in json.dumps(
        message
    )
    command = [
        "docker",
        "run",
        "--rm",
        "--network",
        "document-scan-pilot_default",
        "--cpus",
        "1",
        "--memory",
        "1g",
        "--memory-swap",
        "1g",
        "-e",
        "SKIP_GIT_CLONE=true",
        "-e",
        "OFFICE=swt",
        "-e",
        "AWS_ACCESS_KEY_ID=local-test",
        "-e",
        "AWS_SECRET_ACCESS_KEY=local-test",
        "-e",
        "AWS_DEFAULT_REGION=us-east-1",
        "-e",
        "S3_ENDPOINT_URL=http://storage:5000",
        "swt-document-scan-runner:local",
        payload["repo_path"],
        *args,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=210)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    key = "document-scans/swt/" + message["job_id"] + "/"
    names = {
        obj["Key"]
        for obj in s3.list_objects_v2(Bucket=BUCKET, Prefix=key).get("Contents", [])
    }
    assert key + "input.pdf" not in names and key + "request.json" not in names
    # At-least-once delivery must not execute an already-consumed source again.
    duplicate = subprocess.run(command, capture_output=True, text=True, timeout=30)
    assert duplicate.returncode == 0, duplicate.stderr


def main():
    queue = initialize()
    stopped = threading.Event()
    errors = []

    def consume():
        while not stopped.is_set():
            messages = sqs.receive_message(QueueUrl=queue, WaitTimeSeconds=1).get(
                "Messages", []
            )
            for message in messages:
                try:
                    time.sleep(2)  # Preserve time to exercise competing admission.
                    runner(json.loads(message["Body"]))
                    sqs.delete_message(
                        QueueUrl=queue, ReceiptHandle=message["ReceiptHandle"]
                    )
                except Exception as exc:
                    errors.append(exc)
                    stopped.set()

    thread = threading.Thread(target=consume, daemon=True)
    thread.start()
    try:
        live.main()
        headers = live.token("scan-owner")
        response = live.requests.post(
            live.API,
            headers=headers,
            json={
                "url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
            },
            timeout=35,
        )
        response.raise_for_status()
        report = live.wait_for_scan(response.json()["id"], headers)
        assert report["status"] == "completed", report
        print(report["result"]["summary"])
        time.sleep(2)
        assert not errors, errors
        assert not s3.list_objects_v2(Bucket=BUCKET, Prefix="document-scans/").get(
            "Contents"
        ), "Staging remains after reconciliation"
        print(
            "PASS: isolated runner upload and URL scans, native district entrypoint, input deletion, duplicate delivery, report import, empty staging"
        )
    finally:
        stopped.set()
        thread.join(timeout=220)
        if errors:
            raise errors[0]


if __name__ == "__main__":
    main()
