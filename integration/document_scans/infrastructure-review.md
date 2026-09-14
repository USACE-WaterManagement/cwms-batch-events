# Existing SWT job definition review

Reviewed cwbi-dev-infrastructure/cwms-batch at
`e0c41ab376ed2a05c260bfd8872d4433d829f870` and the current dispatcher source.
No CDK, IAM, bucket, or job-definition changes are included or deployed.

| Area | Consequence |
| --- | --- |
| API task | Scanner execution and Java are removed. API receives/stages uploads and coordinates reports; scanner CPU/memory belong to the separate Batch task. |
| Dispatcher | Existing office routing remains `cwms-swt-jobs-jobdef` / `cwms-swd-jq`. The existing command override passes a fixed runner plus scan UUID and bucket; no document bytes, source URL or bearer token. |
| District image | Extend the existing SWT-compatible image in swt-wm-cwbi-jobs. Preserve its entrypoint and other district jobs. The current job definition must resolve to an image containing this extension before enabling. No new job definition is requested. |
| Task role | Reusing the job definition also reuses its task role. Trusted SWT scripts share its privileges. This is district-level, not dedicated-scanner IAM isolation. |
| Staging | The reviewed infrastructure does not establish an existing suitable private scan bucket or the required grants. Explicit private/unversioned staging and a lifecycle rule are required; public/internal website buckets are not assumed suitable. No provisioning is performed here. |
| Input transport | SQS/Batch carry identifiers only. Uploads use private S3; URLs reside in the private manifest and are fetched by the worker. Cleanup occurs on terminal outcomes and expiry, with a lifecycle backstop for outages. |
| Dispatch retries | Conditional S3 claims make duplicate delivery harmless for scan execution. If a worker dies after claiming, this pilot expires the request rather than replaying its PDF automatically. |
| Authentication | User reads remain SWT- and owner-scoped. Dispatcher binding uses existing internal service authentication. Worker exchange uses the task's S3 role, without user tokens or direct database access. |
| ALB/proxy | Existing wildcard ALB routing covers /document/scan. External upload buffering, limits and CAC remain deployment verification items. |

The earlier API-local implementation is superseded. Reusing the SWT job definition
avoids a new per-job rule, but does not imply that private storage permissions or the
required district image already exist in the deployed environment.
