# SWT Batch document scan pilot

`POST /document/scan` accepts a PDF multipart `file` (10 MiB maximum) or JSON
`{"url":"https://approved-host/document.pdf"}`. `GET /document/scan` and
`GET /document/scan/{id}` expose only the submitting SWT user's unexpired reports.
Responses use `Cache-Control: no-store`. The separate web app is
`swt-wm-web-internal/document-scans`.

## Execution and storage

The API contains no Java or veraPDF and does not execute a scanner subprocess.
Uploads stream through a bounded Linux memory descriptor into a dedicated private
S3 staging bucket. The source closes when submission ends. URLs and host restrictions
are stored in the private request manifest, never in Batch arguments or job logs.

The existing SQS dispatcher submits `cwms-swt-jobs-jobdef` on `cwms-swd-jq`.
It receives only a scan UUID and bucket name with a fixed installed command:
`/opt/document-scan/venv/bin/python /opt/document-scan/run.py`. The image extension
and runner live in `swt-wm-cwbi-jobs/document-scans`. This pilot uses server-defined
arguments; it does not implement the full generic user-argument design in issue 156.

The runner conditionally claims the scan to tolerate duplicate delivery. It reads
the PDF into memory, applies the size and 120-second scan limits, then deletes
`input.pdf` and `request.json` before publishing a result. No user token, database
credential, or public/presigned source URL is passed through the queue. Approved URL
downloads require public HTTPS, pin validated DNS addresses, verify TLS, and reject
redirects, credentials, compressed responses and private/reserved addresses.

The API reconciles S3 results every ten seconds, validates/normalizes the summary,
stores it in existing PostgreSQL, and removes staging/claim/result objects. Reports
are visible for 24 hours; expired reports are hidden even before periodic deletion.
One active scan is admitted across API workers for the SWT pilot. `running` includes
Batch queue time. The one-hour deadline covers queueing and execution; expiry fails
the request and deletes staging. Receiving has a five-minute orphan cleanup deadline.
Delete failures retain cleanup responsibility and are retried by reconciliation.

Hard task kills or API outages cannot guarantee immediate deletion. A mandatory
one-day S3 lifecycle rule provides a backstop; lifecycle deletion is asynchronous.
Reports may remain in existing database backups. General SWT jobs share the existing
task role: deployment administrators and trusted district job code remain privileged.

## Deployment requirements (no CDK change in this pilot)

- Keep `DOCUMENT_SCAN_ENABLED=false` until the prerequisites below are satisfied.
- Apply both document-scan migrations and update the API and dispatcher images.
- Build the district scanner extension from the current SWT job image, with Java 21
  and the existing `SKIP_GIT_CLONE` entrypoint support. Make that extended image
  available through the image reference already used by the SWT job definition.
  Do not replace the district image with a scanner-only image or change the job definition.
  The reviewed CDK configuration maps SWT to the shared `wmes-job-runner` repository,
  also used by other offices. Do not overwrite its shared tag as an SWT-only rollout.
  With job-definition/CDK changes deferred, installation into that shared runtime
  needs a separately reviewed image rollout; a private district image cannot be
  selected through the current command override alone.
- Configure `DOCUMENT_SCAN_BUCKET` explicitly. There is no fallback to existing
  web, log, or public CDA blob storage. The API checks all four S3 Block Public Access
  flags, disabled versioning (not suspended), and an enabled one-day expiration rule
  whose filter is exactly `{"Prefix":"document-scans/"}`.
- API role: bucket read configuration (`GetBucketPublicAccessBlock`,
  `GetBucketVersioning`, `GetLifecycleConfiguration`) and Get/Put/DeleteObject for
  `document-scans/swt/*`. Existing SWT job role: Get/Put/DeleteObject for that same
  private prefix. Objects use SSE-S3. Provide these through existing approved storage
  and permissions; this change does not create a bucket or alter IAM/CDK.
- Set `DOCUMENT_SCAN_ORIGINS` and optional `DOCUMENT_SCAN_URL_HOSTS` JSON lists.
  Configure the web app and Keycloak redirect. Verify production proxy/WAF upload
  buffering, size, logs and timeouts before enabling.

## Local checks

Use disposable Docker services, not live AWS. Build the API image and the district
runner image as described in its repository. The latter must be tagged
`swt-document-scan-runner:local`. Python needs requests, boto3 and reportlab.

```powershell
rtk docker build -t document-scan-api:local .
rtk docker compose -f integration/document_scans/compose.yml up -d
rtk docker cp integration/document_scans/users.sql document-scan-pilot-oracle-1:/tmp/document-scan-users.sql
rtk docker exec document-scan-pilot-oracle-1 sqlplus -s -L CWMS_20/simplecwmspasswD1@localhost:1521/FREEPDB1 '@/tmp/document-scan-users.sql'
rtk python integration/document_scans/generate_sample.py C:/temp/sample-accessibility.pdf
rtk python integration/document_scans/verify_batch.py C:/temp/sample-accessibility.pdf
rtk docker cp integration/document_scans/verify_storage.py document-scan-pilot-api-1:/tmp/verify_storage.py
rtk docker exec -e PYTHONPATH=/code document-scan-pilot-api-1 python /tmp/verify_storage.py
```

Keycloak is on localhost:18080, CDA on 18081, the API on 18082 and Moto on 18083.
Fixture users are `scan-owner`, `scan-other` (SWT), and `scan-outside` (SPK), with
password `local-scan-only`. The harness emulates SQS/S3, uses real CDA/Keycloak, and
launches actual runner containers. It does not prove AWS IAM, Batch scheduling,
CAC federation, production image availability, or Fargate operation.
