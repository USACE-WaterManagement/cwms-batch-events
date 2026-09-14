# SWT document scan pilot

Routes are `POST /document/scan`, `GET /document/scan`, and
`GET /document/scan/{id}`, relative to the configured API root. POST accepts one
multipart `file` or JSON `{"url":"https://approved-host/document.pdf"}`.
The standalone UI is in swt-wm-web-internal/document-scans.

## Runtime and privacy

Only authenticated SWT CWMS Users can scan. Every report query includes the
submitting CDA username; another user receives 404 for that scan ID. Responses
use `Cache-Control: no-store`. Each submission has a UUID. SHA-256 is metadata,
never an authorization token or cross-user cache key.

PDFs up to 10 MiB stream into an anonymous Linux memfd, without UploadFile spooling,
blobs, S3, or database document bytes. Descriptors close on success, rejection,
failure and cancellation. A PostgreSQL partial unique index admits one receiving
or running scan globally, across workers and replicas. This is API-local processing,
not an AWS Batch job. There is no input recovery after worker loss; submit again.

Receiving/fetching is limited to 30 seconds. The scanner has a 120-second timeout,
256 MiB Java heap and 256 KiB output cap. Children are killed if the API worker
exits. Scanner stderr is discarded and core dumps disabled. The Java 21 policy
denies filesystem writes and sockets on both read-only and writable API roots.
Static veraPDF resources are unpacked when building the image; decoder paths
requiring disk spill fail closed. The deprecated SecurityManager must be replaced
before moving to a Java release without that enforcement.

Only normalized rule counts, static descriptions, priorities, timestamps, size and
hash are persisted. Filenames, URLs, PDF bytes, extracted text and raw diagnostics
are excluded. Reports become invisible 24 hours after completion/failure. Cleanup
runs at startup, every 15 minutes and before submissions. Interrupted active rows
are marked failed during cleanup after their five-minute receiving deadline or
three-minute running deadline. The scanner has an independent process watchdog
so busy API requests cannot extend its processing timeout. Database backups
may retain reports under the existing database backup policy.

URL input is opt-in for exact approved hostnames. HTTPS port 443 only: no credentials,
fragments, redirects, compressed HTTP responses, private/reserved/multicast IPs or
mixed public/private DNS answers. Connections pin the validated IP and verify TLS
against the original hostname. No login tokens, cookies or proxy environment are
used. Fetching runs in a cancellable child sharing the anonymous descriptor.

## Local validation

Requires Docker Linux containers, Python with requests and reportlab, and a locally
built `cwms-rest-api:local-dev` image (or set `CDA_IMAGE`). The compose project owns
separate Oracle, PostgreSQL and Keycloak services and exposes only loopback ports.

```powershell
rtk python integration/document_scans/run_gate.py C:/temp/document-scan-evidence
rtk docker compose -f integration/document_scans/compose.yml up -d
rtk docker cp integration/document_scans/users.sql document-scan-pilot-oracle-1:/tmp/document-scan-users.sql
rtk docker exec document-scan-pilot-oracle-1 sqlplus -s -L CWMS_20/simplecwmspasswD1@localhost:1521/FREEPDB1 '@/tmp/document-scan-users.sql'
rtk python integration/document_scans/verify_live.py C:/temp/document-scan-evidence/sample-accessibility.pdf
rtk docker cp integration/document_scans/verify_lifecycle.py document-scan-pilot-api-1:/tmp/verify_lifecycle.py
rtk docker exec -e PYTHONPATH=/code document-scan-pilot-api-1 python /tmp/verify_lifecycle.py
```

Keycloak is on port 18080, CDA on 18081, and Batch Events on 18082.
`scan-owner` and `scan-other` have SWT access; `scan-outside` has SPK access.
Their disposable fixture password is `local-scan-only`. The browser uses PKCE;
the API fixture uses local password grants to exercise real signed JWT/CDA roles.
The generated PDF deliberately lacks tags/language and produces known failures.

```powershell
rtk docker build --target builder --build-arg REQ_FILE=requirements-dev.txt -t document-scan-tests:local .
rtk docker run --rm --network none -e AWS_EC2_METADATA_DISABLED=true -e PYTHONDONTWRITEBYTECODE=1 -v "${PWD}:/code:ro" -w /code document-scan-tests:local pytest -q --no-cov -p no:cacheprovider tests/cwms_batch_events/api tests/cwms_batch_events/core/auth/user
```

## Deployment configuration

Disabled by default. Run the migration and deploy the scanner-containing API image
before setting `DOCUMENT_SCAN_ENABLED=true`. Set `DOCUMENT_SCAN_ORIGINS` to a JSON
list of exact internal-site origins for cross-origin browser calls. Set
`DOCUMENT_SCAN_URL_HOSTS` to a JSON list of approved public HTTPS hosts, or leave
empty to disable URL fetching. Register the standalone page in the Keycloak client.

No new per-script CDK/IAM rules, queues, buckets or Batch job definitions are needed.
The task's new environment settings still need to be applied through deployment
configuration. Public proxy/WAF upload-size, buffering and timeout behavior must
be verified before enabling uploads. Local results do not prove live Fargate,
CAC federation, proxy behavior, or full Section 508 compliance.
