# Server logs

Signed-in users can open the header checkmark (or warning indicator) to read API
server logs in the existing warnings modal. The checkmark means there are no
current UI warnings, not that server logs contain no errors. Java runner output
remains in each run's Job History log viewer.

The scrollable table displays event time, detected level, and the original message.
Expand CloudWatch details for stream, event ID, ingestion time, and JSON fields.
Level filtering applies to loaded entries, including UNKNOWN for unclassified
output. Refresh starts a new time window; Load more continues the current window.
Reads happen only while the modal is open, with no background polling. Closing
the modal discards entries and cancels pending browser requests.

## Endpoint

`GET /server-logs` requires the existing current-user authentication dependency.
It returns `entries`, `nextCursor`, `startTime`, `endTime`, and `logGroup`.
Times are Unix milliseconds. Optional `start_time` and `end_time` select up to
24 hours; the default is the last hour. Pass `cursor` with the returned start/end
times to continue, even when a page has no events. The API makes one CloudWatch
request per page, up to 200 events / the AWS page size limit, oldest first.
The UI holds at most 2,000 entries. Responses have `Cache-Control: no-store`.

## Deployment

Defaults match the CWBI infrastructure's API container:

- `SERVER_LOG_GROUP=ecs/cwms-batch/cwms-batch-events-api`
- `SERVER_LOG_STREAM_PREFIX=ecs/cwms-batch-events-api/`

The prefix excludes the migration container sharing the group. Configure both
values for another deployment. Clients cannot select arbitrary groups or streams.
The API task role needs `logs:FilterLogEvents` on the configured log group's
streams. The current infrastructure source grants this under `ecs/cwms-batch/*`;
confirm deployed IAM and the actual group when rolling out. This PR does not
deploy infrastructure. Local environments need AWS credentials and configuration
to read CloudWatch; missing access produces an unavailable state, not empty logs.

All authenticated users can read the configured API logs across offices, as
intended for this shared server view. Do not configure groups containing unrelated
applications. Messages/JSON are displayed as text and CloudWatch data protection
masking stays enabled (`unmask=false`); no unmask permission is needed. Application
logging must continue to avoid credentials and secrets. DEBUG filtering cannot
recover DEBUG events that the server did not emit.

CloudWatch pagination follows the [FilterLogEvents contract](https://docs.aws.amazon.com/boto3/latest/reference/services/logs/client/filter_log_events.html),
including continuation after empty pages and eventual ingestion delays.
