# Infrastructure review

Reviewed cwbi-dev-infrastructure/cwms-batch at
`e0c41ab376ed2a05c260bfd8872d4433d829f870` (origin/cwbi-dev), and Batch Events at
`7e04bb7e117cedecc2618c0503c5ad250bb699a7` before this change.

| Area | Finding and implementation consequence |
| --- | --- |
| API Fargate task | `infrastructure/stacks/ecs_services/api.py` configures 512 CPU units and 1024 MiB for the entire task. Keep one admitted scan globally, 256 MiB Java heap and bounded runtime/output. No capacity increase is included. |
| Two API workers / deployments | The admission limit must live in PostgreSQL, not a per-worker semaphore. Worker loss kills children and leaves a recoverable failed report, never a queued document. Deployment interruptions require re-upload. |
| Migrations | The API depends on migration container success. Ship the new migration image and API image together before enabling the feature. |
| API ALB | `internal_alb.py` forwards `/*`; this route does not require a new path listener rule. External HTTPS proxy/WAF policy is outside this review and still needs a 10 MiB upload, buffering/logging, CORS and timeout check. |
| AWS Batch/SQS | Neither receives these documents or scans. Generic job submission, shared scripts, and their existing broad log/read routes do not provide the required private transport. No Batch job definition, script distribution or job-specific IAM rule is needed. |
| Storage | RDS uses encrypted storage and has the `ec2_backup=true` tag. Report expiry controls API visibility and normal-table cleanup, not physical deletion from backups. No new document storage permission is granted. |
| Filesystem | Fargate tmpfs is not the assumed transport. Use Linux memfd and a scanner that rejects filesystem writes. The stock veraPDF CLI was unsuitable because of runtime config/log/resource writes; the adapter bypasses it. |
| Authentication | Existing Batch bearer authorization already validates the cwms client and fetches a CDA profile. The scan router checks SWT and owner on every request. Token validation now precedes cached profile reuse so the cache cannot extend token expiry. Local PKCE/CDA tests do not prove CAC federation in CWBI. |
| Feature configuration | The current task has no automatic pass-through for new settings. Enablement/origin/URL-host environment values must be added to the deployment configuration. This is configuration work, even though there are no new per-job CDK/IAM rules. |

No AWS resources were deployed or modified during this implementation. The source
review and local Docker limits do not establish production throughput. Start with
the SWT pilot and measure API latency/memory under representative PDF load before
considering more concurrency or wider office access.
