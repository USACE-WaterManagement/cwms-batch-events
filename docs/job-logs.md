# Job logs

The log viewer reads output while an AWS Batch job is running. Choose an update
interval of 2 seconds, 5 seconds (default), 10 seconds, 30 seconds, or Paused.
Automatic updates pause in hidden browser tabs and stop when the viewer closes.
Pending jobs do not automatically request logs; Refresh logs is available.
Completed and failed jobs fetch once when opened. An observed transition to
completion gets a final fetch and at most three follow-up checks, five seconds
apart, for delayed ingestion. Then automatic updates stop. Refresh logs remains
available for output that reaches CloudWatch later.

Each update appends new output. Large backlogs show Load more; they do not
trigger rapid automatic requests. A new Batch attempt replaces the displayed
output with the latest attempt. The viewer keeps at most 2 million characters
and labels truncated output. CloudWatch retains the original logs.

The local Docker executor uploads a complete S3 log after execution, so its
viewer waits for completion rather than repeatedly checking for live output.
Network/server failures retry once, then stop automatic updates and preserve
the output already loaded. Client errors do not automatically retry. Use
Refresh logs after an error to read from the beginning with a fresh cursor.

## API

`GET /jobs/{job_id}/logs/page?cursor=...` returns `logs`, `nextCursor`,
`hasMore`, `reset`, `available`, `message`, and `supportsLive`. The first request omits
`cursor`. Append `logs` unless `reset` is true; keep `nextCursor` for the next
request. `available: false` indicates an unavailable stream/object; `message`
explains missing dispatch, missing stream metadata, or an unavailable CloudWatch resource.
`supportsLive: false` identifies the completion-only local executor.

Job history, details, and both log endpoints require CWMS Users membership in
the job's office. Colleagues can read each other's runs without a management
role. List pagination and totals use the same office filter. Jobs outside the
user's offices return 404, even when that user originally submitted them.
The server resolves the stream from the job; a cursor never grants
access to another job. A request reads at most three CloudWatch pages (up to
3 MB before JSON encoding), and follows forward tokens even across empty
pages. `hasMore` means more pages may remain, not that every next page contains
output. Expired cursors and new streams restart from the head with `reset`.
Malformed cursors return 400; other AWS failures remain errors.

## Shared run attribution

Apply V1_01_16 before deploying this API version. It adds a display-name
snapshot, trigger metadata, and an index for office history queries. No
ownership backfill is required: existing jobs already have an office.
See the [existing-database rollout plan](office-history-upgrade.md) for identity
handling, migration ordering, verification, rollback and the retention follow-up.

New runs capture a readable name from verified token claims, falling back to
the CDA username for API-key callers. Raw usernames remain internal audit
identities; job responses suppress numeric/EDIPI-bearing attribution fields.
The UI uses `displayName`, with a safe username fallback for older responses.
Old rows containing only an EDIPI show "Name unavailable"; no name is guessed.
This does not redact arbitrary text printed by scripts into their logs.

`POST /jobs` accepts `runTrigger`: `manual`, `scheduled`, or `unknown`.
The UI sends `manual`. Cron/Airflow clients should send
`{"scriptId": "<registered-script-uuid>", "runTrigger": "scheduled"}`.
This is caller-reported display metadata, not an authorization mechanism.
Existing clients and historical rows default to `unknown`; the UI never infers
scheduling from a username, timestamp, or a script's current configuration.
Scheduled executions appear only if submitted through Batch Events. Jobs
submitted directly to AWS Batch are not imported by this change.

The existing `GET /jobs/{job_id}/logs` response is unchanged. Apply migration
V1_01_14 through the existing migration pipeline before deploying the API,
then deploy the status updater and frontend. No CDK, new IAM permissions, or
streaming proxy configuration are required. Logs remain subject to CloudWatch
ingestion latency. Python runners should use `PYTHONUNBUFFERED=1` to avoid
holding stdout in the process until buffers fill or execution finishes.

The status updater saves the stream from Batch state events, including events
received while nobody has the viewer open. Job detail and log reads reconcile
Batch status at most once per job per 15 seconds, shared across API workers
using a database claim. Job details expose `batchStatus` and `batchStatusReason`
to distinguish queued jobs from running containers. Finished jobs with a saved
stream no longer need DescribeJobs to read logs. Retention still applies in
CloudWatch. Historical jobs whose Batch metadata expired before their stream
was saved cannot be recovered automatically by this change.

Deploy the runner image from `cwbi-dev` for dev jobs. Publishing the main-branch
image does not update the dev image. Successful builds alone do not prove the
API service or Batch runner is using the new image.

## Status and timing diagnostics

The viewer displays Batch's Starting state within the normal status field;
run lists reuse the selected job's detail updates without additional requests.
Starting means the container has not begun running. Running does not guarantee
that output has reached CloudWatch yet. The existing five-second UI interval
and 15-second Batch reconciliation limit are unchanged.

API timing diagnostics require both `DEPLOYMENT_ENVIRONMENT=dev` and
`LOG_LEVEL=DEBUG`. The dev API image workflow sets DEBUG; local, test, and prod
images default to INFO. Setting DEBUG in another environment does not enable
these diagnostics. Set LOG_LEVEL=INFO to disable them in dev. Only the
`cwms_batch_events.job_log_timing` logger is raised to DEBUG, keeping AWS SDK
request/response logging at its existing level.

Search API service logs for `job_log_timing` and a job ID. `status_callback`
records callback delay; `batch_refresh` records lookup duration and status;
`batch_refresh_throttled` identifies the shared refresh limit. `awaiting_dispatch`
and `awaiting_stream` identify missing references. `cloudwatch_page` records
request duration, page/event counts, newest event age, and the largest observed
ingestion delay (ingestionTime minus event timestamp). Empty pages have no
event-age or ingestion-delay measurement. `cloudwatch_error` records only the
AWS error code. These diagnostics exclude log content, cursor values, tokens,
and environment values. They do not measure buffering inside the job process.
