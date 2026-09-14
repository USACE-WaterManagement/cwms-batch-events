# Job logs

The log viewer reads output while an AWS Batch job is running. Choose an update
interval of 2 seconds (default), 5 seconds, 10 seconds, 30 seconds, or Paused.
Automatic updates pause in hidden browser tabs and stop when the viewer closes.
Pending jobs do not request logs. Completed and failed jobs fetch once when
opened; a running job transitioning to either status gets one final fetch.
There is no recurring polling after completion. Use Refresh logs for output
that reaches CloudWatch later.

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
`hasMore`, `reset`, `available`, and `supportsLive`. The first request omits
`cursor`. Append `logs` unless `reset` is true; keep `nextCursor` for the next
request. `available: false` indicates that the stream/object is not ready.
`supportsLive: false` identifies the completion-only local executor.

The endpoint requires the submitting user, matching the existing user-scoped
job list. The server resolves the stream from the job; a cursor never grants
access to another job. A request reads at most three CloudWatch pages (up to
3 MB before JSON encoding), and follows forward tokens even across empty
pages. `hasMore` means more pages may remain, not that every next page contains
output. Expired cursors and new streams restart from the head with `reset`.
Malformed cursors return 400; other AWS failures remain errors.

The existing `GET /jobs/{job_id}/logs` response is unchanged. Deploy the API
before the frontend. No CDK, new IAM permissions, database migrations, or
streaming proxy configuration are required. Logs remain subject to CloudWatch
ingestion latency. Python runners should use `PYTHONUNBUFFERED=1` to avoid
holding stdout in the process until buffers fill or execution finishes.
