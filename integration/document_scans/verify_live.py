"""Exercise the isolated local Keycloak/CDA/API stack without printing tokens."""

import argparse
import json
import time
from pathlib import Path

import requests

API = "http://localhost:18082/document/scan"
AUTH = "http://localhost:18080/auth/realms/cwms/protocol/openid-connect/token"


def token(username):
    response = requests.post(
        AUTH,
        data={
            "client_id": "cwms",
            "grant_type": "password",
            "username": username,
            "password": "local-scan-only",
        },
        timeout=10,
    )
    response.raise_for_status()
    return {"Authorization": "Bearer " + response.json()["access_token"]}


def wait_for_scan(scan_id, headers):
    deadline = time.monotonic() + 130
    while time.monotonic() < deadline:
        response = requests.get(API + "/" + scan_id, headers=headers, timeout=10)
        response.raise_for_status()
        assert response.headers.get("Cache-Control") == "no-store"
        report = response.json()
        if report["status"] in ("completed", "failed"):
            return report
        time.sleep(1)
    raise AssertionError("Scan did not finish")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    owner, other, outside = [
        token(u) for u in ("scan-owner", "scan-other", "scan-outside")
    ]
    anonymous = requests.get(API, timeout=10)
    assert anonymous.status_code == 401
    assert anonymous.headers.get("Cache-Control") == "no-store"
    response = requests.get(API, headers=outside, timeout=10)
    assert response.status_code == 403, (response.status_code, response.text)
    document = args.pdf.read_bytes()
    response = requests.post(
        API,
        headers=owner,
        files={"file": ("sample.pdf", document, "application/pdf")},
        timeout=35,
    )
    assert response.status_code == 202, (response.status_code, response.text)
    scan_id = response.json()["id"]
    competing = requests.post(
        API, headers=other, files={"file": ("sample.pdf", document)}, timeout=35
    )
    assert competing.status_code == 429, competing.text
    assert (
        requests.get(API + "/" + scan_id, headers=other, timeout=10).status_code == 404
    )
    assert scan_id not in [
        s["id"] for s in requests.get(API, headers=other, timeout=10).json()
    ]
    report = wait_for_scan(scan_id, owner)
    assert report["status"] == "completed", report
    assert report["result"]["failed_rules"] > 0
    assert "sample.pdf" not in json.dumps(report)
    for content, status in [
        (b"", 415),
        (b"not a PDF", 415),
        (b"%PDF-" + b"x" * (10 * 1024 * 1024), 413),
    ]:
        result = requests.post(
            API, headers=owner, files={"file": ("test.pdf", content)}, timeout=35
        )
        assert result.status_code == status, (result.status_code, result.text)
    for url in [
        "https://169.254.169.254/latest/meta-data",
        "http://localhost/private",
        "https://unapproved.example/a.pdf",
    ]:
        result = requests.post(API, headers=owner, json={"url": url}, timeout=35)
        assert result.status_code == 400, result.text
    print(
        json.dumps(
            {
                "verified": [
                    "Keycloak login",
                    "CDA SWT roles",
                    "anonymous denied",
                    "other office denied",
                    "owner isolation",
                    "global admission",
                    "real PDF scan",
                    "size/type rejection",
                    "unsafe URL rejection",
                    "no-store",
                ],
                "scan": report,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
