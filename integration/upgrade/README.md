# Upgrade compatibility

Run `python integration/upgrade/run.py` after installing `requirements-dev.txt`.
Docker must be running. The harness builds the candidate migration image, creates
an isolated PostgreSQL 17 container with an ephemeral localhost port, and removes
only its own container and image afterward. It never connects to an environment database.

The fresh database receives all migrations. The upgrade database first stops at
schema 1.01.03, the last schema before runtime registration, and loads `legacy.sql`
directly. It then receives every remaining migration through Flyway `migrate`,
including its built-in validation. The role-grant repeatable migration deliberately
uses Flyway's current timestamp and is reapplied on each migration run.
The baseline is intentionally retained so later PRs continue exercising the
historical records that exposed the SWT regression. Add fixtures/baselines when
other released data shapes need coverage; do not recreate historical fixtures
through current request models.

The candidate API uses its real database dependencies and application database
role. Only authentication and outbound queue delivery are replaced. Checks cover
office/role filtering, catalogs, historical jobs, invalid execution rejection
without pending jobs, and creating/editing/queuing valid registrations. No district
program executes. This is an in-process API integration test, not a deployed
network/credential test.

The workflow runs for every environment-targeted PR. Configure `upgrade` as a
required check in branch protection to make it a merge gate.
