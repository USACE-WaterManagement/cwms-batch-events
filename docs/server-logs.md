# Server logs

Signed-in users can open the header checkmark (or warning indicator) to read API
server logs in the existing warnings modal. The checkmark means there are no
current UI warnings, not that server logs contain no errors. Java runner output
remains in each run's Job History log viewer.

The scrollable table displays event time, detected level, and the original message.
Expand CloudWatch details for stream, event ID, ingestion time, and JSON fields.
Named levels filter structured JSON events in CloudWatch, including matching
events beyond the pages already loaded. All levels includes historical text;
UNKNOWN scans one unfiltered page at a time for unclassified output. Changing
level or refreshing starts a new window; Load more continues the current window.
Reads happen only while the modal is open, with no background polling. Closing
the modal discards entries and cancels pending browser requests.

## Endpoint

`GET /server-logs` requires the existing current-user authentication dependency.
It returns `entries`, `nextCursor`, `startTime`, `endTime`, `logGroup`, and `level`.
Times are Unix milliseconds. Optional `start_time` and `end_time` select up to
24 hours; the default is the last hour. Pass `cursor` with the returned start/end
times and the same `level` to continue, even when a page has no events. Cursors
are scoped to the time window, level, configured group and stream prefix;
mismatches return 400 and require a refresh. `level` accepts ALL (default), TRACE,
DEBUG, INFO, WARNING, ERROR, CRITICAL, or UNKNOWN. Named levels use the exact JSON
filter `{ $.level = "ERROR" }` (with the selected canonical uppercase level).
Historical text and alternate JSON field names remain available under ALL.
The API makes one CloudWatch
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

## Application logging

The API, Lambda entry points and local dispatcher use named Python loggers with
one JSON object per line: `timestamp`, `level`, `logger`, `message`, `process`,
`service`, `environment`, and `version`.
Lifecycle events add identifiers and status fields that appear under CloudWatch
details. API events also include a generated `request_id`; the response's
`X-Request-ID` header identifies the corresponding request.

Set `LOG_LEVEL` to DEBUG, INFO (default), WARNING, ERROR, or CRITICAL. Invalid
values fall back to INFO. DEBUG applies to application loggers; SDK and database
wire diagnostics are not enabled by this setting. Existing detailed job-log
timing diagnostics remain restricted to dev plus DEBUG.

- INFO: initialization, job registration/queueing/dispatch/binding, changed job
  status or log-stream discovery, successful API writes, and local job exits.
- DEBUG: successful API reads (including health and log polling), queue polling,
  ignored/duplicate status events, and CloudWatch page counts.
- WARNING/ERROR: rejected or failed requests, queue/runner failures, CloudWatch
  read failures, and failed local container cleanup.

The request logger replaces Uvicorn/Gunicorn access output in API workers. It
records route templates, status and duration, excluding raw paths, queries,
headers, bodies and user names. Queue payloads, command arguments and rejected
API response bodies are not logged. Exception events retain the exception type
and stack locations, excluding exception text, local variables and source lines
which can contain credentials or SQL parameters. This is not a general redactor:
new logging calls must also keep sensitive data out of their message strings.

The reader supports historical bracketed, timestamped and colon-separated levels
as well as JSON level fields. Old print/access lines and traceback fragments that
contain no explicit severity remain UNKNOWN; this change cannot retroactively
add levels to already stored events. Gunicorn master startup before the API
worker initializes can still use its normal bracketed format. Lambda/dispatcher
logs remain in their own groups; the server viewer still reads only the API group.

## Lambda and job correlation

Both Lambda handlers use [AWS Lambda Powertools Logger](https://docs.aws.amazon.com/powertools/python/latest/core/logger/).
Invocation events include cold-start status, function name/ARN, memory size,
invocation request ID and the X-Ray trace ID when the runtime supplies one.
Input event logging is explicitly disabled. The custom formatter preserves safe
exception fields; invocation and per-job context are reset even when handling fails.

The API-generated request ID travels in the optional queue `request_id` field.
Dispatch logs include that ID and the internal job ID; Batch submission tags
carry both IDs for status events. Older messages and events without tags remain
supported, with the external Batch ID linking status updates to binding logs.
`correlation_id` uses the internal job ID when present, then the external Batch ID,
API request ID, or Lambda invocation ID.

Batch and local containers receive `BATCH_EVENTS_JOB_ID`,
`BATCH_EVENTS_CORRELATION_ID`, `BATCH_EVENTS_SERVICE_NAME`,
`BATCH_EVENTS_ENVIRONMENT`, `BATCH_EVENTS_VERSION`, and, when available,
`BATCH_EVENTS_REQUEST_ID`. Workload scripts can include these in their own JSON
logger fields. Arbitrary Java/Python subprocess stdout is not automatically
converted to structured logs; configure the workload's logger to emit uppercase
`level`, `message`, and these correlation fields for rich job output.

Lambda builds embed the deployment environment and Git revision in
`cwms_batch_events/build-info.json`; API containers use `DEPLOYMENT_ENVIRONMENT`
and `BUILD_REVISION`. Local defaults are `local`. Both deployment workflows use
`integration/package_lambda.py`, including shared modules and Powertools
dependencies. `python integration/check_lambda_packages.py` builds and imports
both artifacts, and runs in PR CI. Existing ECS stdout collection remains the
transport to CloudWatch.

CloudWatch pagination follows the [FilterLogEvents contract](https://docs.aws.amazon.com/boto3/latest/reference/services/logs/client/filter_log_events.html),
including continuation after empty pages and eventual ingestion delays.
