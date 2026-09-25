# Capacity and retry review

Reviewed 2026-09-24 against cwbi-infrastructure/cwms-batch. Relevant Batch,
office-job, and dispatcher files match across cwbi-dev (`cabb0917`), cwbi-test
(`4d6c30e4`), and cwbi-prod (`e746eb61`). These are source settings, not proof
of deployed AWS quotas, capacity, subnet IP availability, or account drift.

## Thirty jobs at the hour

The app can register thirty due occurrences, persist them with their queue messages,
and deliver them to the existing SQS queue. Delivery scans at most fifty messages
per pass with a ten-second work budget. Slow queue requests can spread delivery
over multiple fifteen-second passes. Queue time is not guaranteed execution time.

The dispatcher consumes SQS batches of ten and submits each job to its division's
Batch queue. Thirty queued jobs do not require thirty API processes. AWS Batch
starts runnable jobs as compute resources become available.

All forty enabled office definitions currently request 1 vCPU and 2 GiB, including
SWT. Thirty simultaneous runs therefore request 30 vCPUs and 60 GiB. Other offices
share division queues and the account's Fargate quotas. A compute environment's
configured ceiling does not reserve capacity.

- [Compute environments and division queues](https://github.com/cwbi-infrastructure/cwms-batch/blob/cabb09172169e29de430ee8e0e741b676194f38a/infrastructure/stacks/batch_services.py#L85) do not set an explicit vCPU maximum. [CDK defaults](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_batch/FargateComputeEnvironment.html) use 256 vCPUs per compute environment. Actual account quotas can be lower.
- The environment named `spot` also omits `spot=True`. Its name and comments do not enable Spot. Verify deployment before assuming discounted pricing or Spot fallback.
- [Job definitions](https://github.com/cwbi-infrastructure/cwms-batch/blob/cabb09172169e29de430ee8e0e741b676194f38a/infrastructure/stacks/batch_services.py#L356) configure one attempt and a thirty-minute running timeout.
- [Dispatcher mapping](https://github.com/cwbi-infrastructure/cwms-batch/blob/cabb09172169e29de430ee8e0e741b676194f38a/infrastructure/stacks/lambda_fns/job_dispatcher_fn.py#L225) uses batches of ten. [SQS](https://github.com/cwbi-infrastructure/cwms-batch/blob/cabb09172169e29de430ee8e0e741b676194f38a/infrastructure/stacks/sqs.py#L35) has a thirty-minute visibility timeout and moves messages to the dead-letter queue after five receives.

## Limits

This PR enforces a five-minute minimum between selected schedule times in the UI,
API writes, and scheduler. Lists, ranges, and steps are checked, including the
midnight boundary. Calendar restrictions do not relax the daily-time spacing rule.
Older invalid schedules remain readable and can be disabled, but the scheduler
will not register their occurrences. Administrators must correct them to resume.

The five-minute rule is not a spending cap. Thirty definitions at that frequency
can produce 360 runs an hour, or 8,640 a day, compared with 720 daily hourly runs.

Recommended follow-up is per-office concurrent and queued-run limits plus a daily
runtime budget, not just a limit on registered definitions. Start with one active
run per definition to prevent accidental overlap. Choose office limits after
confirming AWS quotas and observed runtimes. If five active runs per office were
selected, thirty submissions would queue and drain rather than start together.
Allow explicit exceptions for workloads designed for concurrent execution.

Enforcement must coordinate manual and scheduled submissions transactionally in
PostgreSQL. Defer scheduled work visibly when a quota is reached, return an
actionable quota response for manual submissions, and reconcile stale active
states before releasing slots. Do not silently discard due work or blindly
requeue uncertain dispatch claims. No per-office cap is implemented by this PR.

## Retry in the UI

The scheduler retries unsuccessful SQS delivery with backoff. That is distinct
from retrying a container's execution. The current Batch definition uses one
attempt, and this app has no retry endpoint.

A UI action is possible without adding AWS resources: create a new run after
rechecking the user's office and execution roles. It should show the saved
command snapshot, confirm that side effects may repeat, record `retryOfJobId`
and the requesting user, and use a new job ID. Keep the original run immutable.
Restrict it to confirmed terminal runs. Jobs with uncertain dispatch outcomes
need investigation before another submission. This is a proposed follow-up,
not a retry button delivered in this pass.

[AWS retry behavior](https://docs.aws.amazon.com/batch/latest/userguide/job_retries.html)
also permits retry strategies at job submission. Exposing automatic attempts should
be a bounded admin policy for idempotent workloads, not an unrestricted retry field.
