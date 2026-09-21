# Deploying shared office history

## Existing runs

Jobs already store `office` and `username`. Sharing changes the read authorization
and list filter from the current username to the user's allowed CWMS offices.
It does not transfer jobs to the person opening the page or to a script's current
office. Existing runs become visible to colleagues in their recorded office,
including jobs whose script was deleted and whose `script_id` is now null.

Preserve the raw username for internal audit. Migration `V1_01_16` adds a nullable
`display_name` snapshot, `run_trigger` defaulting to `unknown`, and the office/date/ID
index. It does not rewrite identity, office, execution configuration, or timestamps.
New submissions capture a safe readable name. Old jobs use a safe username when
available; numeric or EDIPI-bearing identifiers display **Name unavailable**.
That means the readable name is unavailable, not that the audit identity was erased.
Manual versus scheduled cannot be reconstructed reliably: old jobs show **Unknown**.
The recorded submitter is the identity that submitted to Batch Events, not the
container OS user or necessarily the downstream CDA credential used by the job.

Do not strip numeric suffixes and guess a person's name, or use the current viewer's
name to backfill another person's runs. If readable historical attribution is later
required, use a reviewed mapping from exact stored principals to an authoritative
identity source; update only missing display names, record the mapping provenance,
and preserve the original username. This release performs no such backfill.

## Rollout checklist

1. Back up the database and verify its migration history. `V1_01_15` is the already
   merged script-configuration migration; the office-history migration is **1.01.16**.
   Do not replace or repair the checksum of the applied 1.01.15 migration. A test
   database that ran the earlier, unmerged office-history 1.01.15 needs a reviewed
   reconciliation or recreation before this release; do not apply a blind repair.
2. Record counts by office/status, rows with missing or unrecognized office values,
   and total jobs before migration. Review unrecognized offices against authoritative
   deployment records. Do not infer ownership from usernames or move those jobs into
   the viewer's office. Office filtering leaves them inaccessible until corrected.
   Review whether old script logs contain material inappropriate for office-wide
   access; attribution filtering does not redact arbitrary job output.
3. Apply all pending migrations through 1.01.16 using the migration pipeline before
   updating application components. The additive fields support older application
   writes via nullable/default values. Schedule a maintenance window appropriate to
   table size: adding columns and building the office index can take database locks.
4. Deploy the API, dispatcher/status updater and UI from the reviewed revision.
   List, count, detail and both log endpoints must all use office authorization.
   There is no import of historical jobs submitted directly to AWS Batch.
5. Verify pre/post counts and unchanged raw usernames, offices and configuration
   versions. As two different members of one office, open the same historical run
   and both log endpoints; verify another office receives 404 and excludes it from
   list totals. Verify a new run records its submitter and manual/scheduled trigger.
   Log availability still depends on retained CloudWatch/S3 data and saved references.
6. If reverting the application, leave additive columns/index in place. Restore the
   prior application revision only after checking schema compatibility. Do not drop
   the new attribution data as part of an application rollback. Reverting also
   reverts access behavior, so verify that behavior explicitly.

The upgrade harness tests a fresh database and upgrades from 1.01.03 and 1.01.15.
Its historical fixture belongs to a different principal than the viewer and verifies
office visibility, suppressed EDIPI, unknown trigger, preserved internal identity,
and unchanged legacy execution configuration. Outbound AWS services are mocked.

## Retention follow-up

Office sharing does not expire database rows. Track the cleanup implementation in
[issue #230](https://github.com/USACE-WaterManagement/cwms-batch-events/issues/230).
The proposed starting policy is 365 days of terminal run history, subject to owner
review, with explicit handling for holds, missing finish times, log/object retention,
and related tables. Pending/Running jobs must be reconciled before cleanup. No purge
is enabled by this PR, and live CloudWatch/S3 lifecycle settings remain to be audited.
