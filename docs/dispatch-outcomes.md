# Dispatch outcomes and recovery

A run is registered before SQS delivery and AWS Batch submission. Previously a rejected SubmitJob request only appeared in dispatcher logs. The job row stayed Pending even if SQS eventually moved its message to a dead-letter queue or expired it.

The dispatcher now claims every run through the internal API before submitting it, including manual runs. Linked, failed, or unresolved runs are never submitted again on SQS redelivery. A malformed or failing message does not prevent the dispatcher from processing other records in the same invocation. The deployed whole-batch retry behavior remains supported; claims suppress duplicate submissions when successful records are delivered again.

A definitive AWS SubmitJob client/access rejection is reported to the authenticated dispatch-failure endpoint. The API records Failed, an end timestamp, and a safe user-facing reason. Missing/inactive job definitions get a specific explanation. This is a dispatch failure, not a failed container execution: no runtime start or AWS Batch status is fabricated. The dispatcher only acknowledges the rejection after the API accepts it.

If submission succeeds but binding fails, or a network/server error leaves submission uncertain, the dispatcher must not retry SubmitJob: AWS may already have started a job. Subsequent deliveries check the existing claim. A failure callback that cannot reach the API has the same uncertainty from the database's perspective. These runs stay pending only until the watchdog deadline; they are never silently treated as successful dispatches.

## Watchdog

The API independently supervises dispatches even when scheduling is disabled:

- `DISPATCH_WATCHDOG_ENABLED=true` by default.
- `DISPATCH_TIMEOUT_MINUTES=60` by default; must be at least 1.
- Every maintenance interval (15 seconds), scan at most 100 expired, unlinked Batch runs. A PostgreSQL advisory lock coordinates replicas, and row locks serialize expiry against claims and callbacks.
- The deadline is measured from dispatch claim time, or creation time if unclaimed. Linked jobs and local Docker jobs are excluded.
- Expired runs become **Dispatch unknown**, leave the queued count, stop showing a progress spinner, and stay visible under Jobs needing attention, even outside the report period. Their reason appears in job details, logs, and the admin panel.
- A dispatcher receiving an expired run refuses to submit it even if the watchdog has not scanned it yet. Unsent scheduled outbox entries for non-Pending runs are retained but no longer delivered.
- A late external-job-ID binding recovers an unresolved run to Pending; normal AWS status handling can then reconcile it. A late definitive rejection can resolve it to Failed. Failure callbacks never overwrite linked or running/finished jobs.

Unknown does not mean cancelled, failed in AWS, or safe to rerun. Check the dispatcher logs using the application job ID and inspect AWS job tags before submitting another run. Linked stale Pending/Running jobs are outside this watchdog: existing job-detail/log reads can refresh them from AWS, but expired AWS metadata may require operator investigation.

## Deployment and cleanup

Deploy the API before the dispatcher because the new dispatcher requires the claim-dispatch and dispatch-failure endpoints. When rolling across API versions, initially set `DISPATCH_WATCHDOG_ENABLED=false`; complete the API rollout before enabling the watchdog, so old replicas do not read the new status. Apply the index migration and deploy the UI along with this release. Do not roll back to an API that cannot deserialize Dispatch unknown while unresolved rows remain. No new AWS permissions or event-source response settings are required.

Existing old unlinked Batch rows become unresolved; the watchdog cannot reconstruct historical AWS rejection reasons. It does not delete runs, receive/purge SQS messages, cancel Batch jobs, or repair missing infrastructure. Deleting a script preserves run history with a null script reference and does not remove already queued execution messages.

Admin cancellation, guarded bulk cleanup, and operator reconciliation are tracked in [#250](https://github.com/USACE-WaterManagement/cwms-batch-events/issues/250). Retention and orphan cleanup are tracked separately in [#230](https://github.com/USACE-WaterManagement/cwms-batch-events/issues/230). This change does not close either issue.
