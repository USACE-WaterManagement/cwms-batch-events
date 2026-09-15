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
office/role filtering, catalogs, historical jobs, migration defaults of v1,
unchanged legacy records after reads/runs, historical command construction in both
runners, explicit edit-to-v2, immutable submitted job versions, all v2 runtimes,
installed commands, and corrupt/unsupported configuration rejection without
pending jobs. Parent-directory paths were accepted by the historical runner and
are checked as v1; v2 still rejects them. No district
program executes. This is an in-process API integration test, not a deployed
network/credential test.

The harness also runs `verify_execution.py`: a disposable `python:3.13-slim`
container executes harmless fixture scripts with both historical commands and
the v1 commands. It checks leading/duplicate slashes, dot/parent segments, and the
historical differences in handling spaces and inline arguments between AWS argv
and Docker command strings. The container has no network or host mounts. This
proves Linux command execution, not AWS submission or district program behavior.

The workflow runs for every environment-targeted PR. Configure `upgrade` as a
required check in branch protection to make it a merge gate.
