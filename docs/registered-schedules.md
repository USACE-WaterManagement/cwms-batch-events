# District job schedules

Batch Events owns scheduling inside the API process. Script administrators choose
an hourly minute or numeric five-field cron and an IANA timezone in Scripts Manager.
Schedules default to disabled. Disable any equivalent Airflow/legacy trigger first.
Scheduling requires script configuration **version 4**. New registrations use v4;
existing v1–v3 registrations keep their execution behavior until an office administrator
chooses **Upgrade configuration** in Details. The upgrade is a separate, idempotent
request with progress and success/error feedback; it never submits a job or enables
a schedule. Ordinary runs do not prompt, and edits retain the existing version.
Legacy v1 upgrades keep effective Python execution and clear ignored runtime/argument
fields. Ambiguous historical paths require a reviewed replacement rather than a guessed
conversion. Existing job snapshots remain unchanged, and stale writes cannot downgrade v4.

Details has General, Source & path, Arguments & command, Access, and Schedule sections.
Save highlights sections and inputs needing correction while retaining the draft.
No new service, EventBridge schedule, or IAM permission is required: the API uses
its existing PostgreSQL and SQS access. Application deployments and migrations
are still required.

## Execution and attribution

The API lifespan starts a watchdog with two independently supervised tasks:

| Task | Purpose | Coordination |
| --- | --- | --- |
| Schedule evaluation | Atomically save due runs and queue messages | PostgreSQL transaction advisory lock and unique script/time index |
| Queue delivery | Retry pending deliveries with backoff capped at five minutes | Separate advisory lock, up to 50 messages/ten seconds per pass, durable outbox |

Both run every 15 seconds off the API event loop. Commands use the same version-aware
validation as manual runs. The existing dispatcher and office Batch definition execute
them with the office's runtime CDA credential. Scheduling is an administrator-authorized
recurring action, not impersonation of the administrator's current CDA session.
Disabling stops future occurrences; already committed runs remain queued. Script saves
record the administrator's private audit identity and readable name. Edits apply only
prospectively. Existing registrations must be saved by an administrator before scheduling.

Office history shares automatic and manual runs through the existing office access rules.
Automatic runs show Batch Events scheduler, Scheduled, the intended time/timezone, and
the administrator who last saved the registration. Manual runs retain their submitter;
unmarked historical runs remain Unknown. Structured logs carry office, script/job IDs,
trigger, and scheduled time. Existing output remains accessible to the office. This
does not concatenate all CloudWatch streams into one output pane.

## Recovery and watchdog limits

- Workers coordinate through database locks, released on disconnection. A malformed
  script is isolated in a savepoint and displays an error without stopping other scripts.
- First startup evaluates the current minute. After an interruption, at most five
  minutes are recovered; older occurrences are skipped with a warning. Edited schedules
  are never evaluated before their save time.
- Spring DST gaps are skipped; repeated fall times run only on the first occurrence.
- Failed task calls are restarted while the other task continues. Hung threads do not
  get overlapping replacements. SQL statement/lock timeouts and bounded SQS calls limit
  blocking. Stalls over two minutes are logged; stale heartbeats appear in the UI.
- Queue retries can redeliver messages. The dispatcher atomically claims each scheduled
  job through the existing authenticated internal API before submitting it to AWS Batch.
  Duplicate messages do not submit the job again.
- **Not exactly-once execution:** a crash after the claim but before submission/binding,
  or a lost claim response, needs inspection. Claims never automatically expire into
  another submission. Scheduled runs pending over ten minutes appear in the office's
  attention count. Inspect dispatcher logs and AWS state before manually replacing a run.
- Queue acceptance is not successful execution. Dead-lettered dispatches need investigation.
  The watchdog cannot restart an entirely stopped API; existing ECS/process supervision
  must do that. All API replicas down means scheduling pauses. No new alerting is added.

`GET /scheduler/status?office=SWT` exposes heartbeats and office-scoped pending delivery,
old pending runs, and invalid schedule counts. `SCHEDULER_ENABLED=false` is an optional
emergency stop, applied consistently across replicas. It defaults to enabled, but the
migrations enable no schedules. Use per-script controls for normal rollout.

## Cleanup

Scheduling and queue recovery are separate tasks. This PR deletes no history, logs,
objects, or sent outbox records. Retention remains #230 and can later use a separate
task with its own lock, heartbeat, and limits after its policy is approved. Never remove
dispatch claims while queue messages may still be redelivered.

## Deployment and rollback

1. Apply migrations through **1.01.19** using the existing pipeline, after office history
   1.01.17. Do not renumber applied migrations.
2. Deploy the API, updated dispatcher Lambda/local dispatcher, and UI. Keep schedules
   disabled until all are updated: old dispatchers reject the scheduler message source.
   Deploy dispatcher v4 support before creating or upgrading v4 registrations.
3. Verify heartbeats, enable one harmless schedule, and verify its queue, execution,
   output, attribution, and office authorization in the target environment.
4. Before rollback, disable schedules and drain/quarantine scheduler messages. Preserve
   the additive schema and history. Do not automatically replay uncertain claims.

## Local review

`python -m tools.scheduler_demo` starts an isolated PostgreSQL container on
127.0.0.1:55439 and API on 127.0.0.1:8019. The sample SWT schedule runs every minute.
Queue delivery and execution are simulated and labeled; no district script runs.
The scheduler, database, API, and office history are real.

Run Vite with `VITE_API_PROXY_TARGET=http://127.0.0.1:8019`. Open Scripts Manager,
use the local demo login, and choose SWT. Submit manually to compare the trigger and
submitter with automatic runs. Stop API/Vite and `docker stop batch-scheduler-demo`
when finished; the database remains for inspection.
