# Registered commands

Script administrators can select a district repository file or an installed command in Scripts Manager. Jobs use the office AWS Batch job definition, credentials, queue, and logs. Use the row's **Run job** action to review and submit the saved settings, or **View job runs** to review your runs. See the [script manager guide](script-manager.md) for the tab workflow and optional execution roles.

| Source | Runtime / executable | Path / arguments | Container command |
| --- | --- | --- | --- |
| District GitHub repository | Python | `python/report.py` | `python /jobs/python/report.py` |
| District GitHub repository | Java JAR | `lib/report.jar` | `java -jar /jobs/lib/report.jar` |
| District GitHub repository | Bash | `bin/report.sh` | `bash /jobs/bin/report.sh` |
| Installed command | `cwms-cli` | `blob`, `upload`, `--help` | `cwms-cli blob upload --help` |

Enter space-separated arguments, quoting values containing spaces (for example, `--name "Daily report"`). The editor previews each parsed value. Unquoted trailing spaces are ignored; quoted spaces and empty arguments (`''`) are preserved. The API still stores `commandArgs` as an array. Select **Bash command** mode for `&&`, `||`, pipes, redirection, or variable expansion. The complete expression runs as `bash -c`; argument mode passes values directly without shell expansion.

Installed commands skip district repository checkout and repository Python dependency installation. Their executable and files, including any JAR, must be available in the container before execution.

For example, `cwms-cli` is already installed in the runner image. A job can create a file and upload it as a CWMS blob without a district script in GitHub, avoiding the checkout and dependency installation time.

In Scripts Manager, register the script with these values:

| Field | Value |
| --- | --- |
| Office | `SWT` |
| Name | Upload job status |
| Source | Installed command |
| Command mode | Bash command |

Enter this in **Bash command**:

```bash
printf 'CWMS Batch Events chained upload example\n' > '/tmp/job status.txt' &&
echo 'Generated file contents:' &&
cat '/tmp/job status.txt' &&
cwms-cli blob upload --input-file '/tmp/job status.txt' --blob-id "$DEMO_BLOB_ID" --media-type text/plain --office SWT
```

Bash runs each step only if the previous step succeeds. `cat` prints the file's
contents exactly to the job log; `echo` adds a readable heading. The line breaks
after `&&` are optional formatting: this is one Bash command, not separate argument
rows. Paths containing spaces stay quoted.

The job environment supplies `CDA_API_ROOT` and `CDA_API_KEY` for the target CDA
service, and `DEMO_BLOB_ID` should be a unique test blob ID (for example,
`BATCH-CHAIN-20260924-001`). You can replace `"$DEMO_BLOB_ID"` with that literal ID
in the editor. Omit `--overwrite` to preserve an existing blob; add it only when
replacement is intended. The runner needs both `cwms-cli` and `cwms-python`.
See the [runnable local integration example](../integration/cwms_cli/README.md)
for the tested package versions and the boundary of the local upload test.

Save the registration, select **Run job** on its row, then **Submit job** in the
selected script. **Job runs** opens the result; **Job History** lists your runs
across scripts. With `||`, a successful fallback can make the whole job succeed;
use `exit 1` in the fallback if the job must remain failed.

For a longer workflow, keep a reviewed `.sh` file in the district repository and
register it with runtime **Bash**. This gives the commands a natural home for
comments and maintenance; the short inline chain above works well for a small
create/print/upload task. `printf ... | tee file` can combine creation and logging,
but a pipeline needs `set -o pipefail` to propagate a failure from `printf`.

Configuration version, runtime, path, and arguments are copied into the job record and queue message when submitted, so later script edits do not change an already submitted job. Version 2 uses the same command construction for local Docker execution and AWS Batch.

For a one-time override, `POST /jobs` accepts `commandArgs` alongside `scriptId`.
Omitting `commandArgs` or sending `null` uses the saved arguments; `[]` runs without
arguments. The override replaces the entire argument array on the job snapshot
and does not update the script. Execution permissions and the saved executable,
runtime, and path still apply. Custom arguments require configuration version 2 or later.
For a v3 shell override, send `commandMode: "shell"` and `shellCommand` instead.
Source still determines repository checkout and dependency setup in either command mode.

## Configuration versions

New registrations use **v4** (`configVersion: 4` in the API). Web edits retain the
saved version. API writes may explicitly use v2/v3 for compatibility, but cannot
create v1 or downgrade an existing registration.
Ordinary reads and runs preserve the version without an upgrade prompt.
Choose **Upgrade configuration** in Details to call `POST /scripts/{id}/upgrade`.
It requires an office script administrator, shows progress and success/error feedback,
and saves v4 without submitting a job or enabling a schedule. Repeating the request is
safe. V2/v3 commands remain unchanged; v1 keeps effective Python execution and clears
historically ignored fields. Ambiguous legacy paths require a reviewed replacement.
The older `POST /jobs` option `upgradeToVersion: 3` remains available for existing
clients but cannot downgrade v4; the web app no longer sends it.

The UI adapts to the saved configuration version without a version selector.
Details and submission explain the available features. Details has separate General,
Source & path, Arguments & command, Access, and Schedule sections. Unknown versions remain
readable but cannot be edited or run by this UI. Configuration versions are
separate from application releases; saved revision history is not included.

Flyway migration `V1_01_15` adds `config_version INTEGER NOT NULL DEFAULT 1`
to both scripts and jobs. All existing unversioned rows are classified as v1,
including rows saved between the registered-runtime release and this migration.
There is no reliable version marker in those rows. The application explicitly
supplies the selected version on registrations and saves; the database default stays 1.
Queued messages without a configuration version also use v1. The queue envelope's
`version` is independent of the script's `configVersion`.

V1 reproduces the execution code immediately before commit
[`3c830a4`](https://github.com/USACE-WaterManagement/cwms-batch-events/commit/3c830a46b4c9a55a00eda702fefd0e75e5ffa779):

- AWS Batch receives `["python", "/jobs/" + repo_path]`.
- Local Docker receives the string `"python /jobs/" + repo_path`, which the Docker
  SDK splits into arguments. Historical quoting and inline arguments retain that
  local behavior; AWS still treats the whole path as one argument.
- Execution type did not select the interpreter. Runtime and separate command
  arguments were not supported. V1 always uses Python and repository checkout.
- The path is preserved literally: `/python/run_hourly.py` becomes
  `/jobs//python/run_hourly.py`; `/jobs/python/report.py` becomes
  `/jobs//jobs/python/report.py`. Dot and parent-directory segments are also
  retained because the old runner accepted them. Success still depends on the
  target file existing in the runner filesystem.
- Empty/blank paths and NUL characters are rejected; they cannot identify a
  runnable historical script.

V2 retains repository path validation, `/jobs/` prefix normalization, Python,
Java JAR and Bash execution, installed commands, and literal argument boundaries.
Its path restrictions are not relaxed for legacy data. Unknown versions fail
with an unsupported configuration schema error before a job is created or
dispatched. Version-specific validation and command construction live in
`core/execution.py`; future schemas should add an explicit handler there.

V3 adds `commandMode` (`arguments` or `shell`) and `shellCommand`. Migration
`V1_01_16` adds these fields to scripts and job snapshots, defaulting existing rows
to argument mode without changing their versions. Shell mode requires a nonblank
command and an empty argument array. Both runners receive the same `bash -c` argv.
Adjacent version upgrades are registered in `EXECUTION_UPGRADES`; future versions
must supply their own validated conversion rather than silently relabeling records.

V4 adds district scheduling and timezone settings while keeping v3 command behavior.
See [district schedules](registered-schedules.md) for recovery and rollout requirements.

Deploy the schema migrations first, then v4-capable dispatchers/runners, then the API and UI.
Older dispatchers cannot validate v4 snapshots. Already queued v1/v2/v3 jobs retain their
original command construction. Local Docker tests cover migrations and Bash behavior;
deployment still needs the normal environment rollout checks.

## Repository browsing configuration

### Java programs from office releases

With the runner's Java artifact loader deployed, repository jobs download the
versions pinned in `java/artifacts.json` before running the registered command.
For SWT, select **District GitHub repository**, runtime **Java JAR**, and manually
enter `java-artifacts/BuildWSmetadataViaCDA.jar`. The resulting command is
`java -jar /jobs/java-artifacts/BuildWSmetadataViaCDA.jar`. Generated release JARs
are not tracked files, so they do not appear in the repository browser.

The pin must be enabled and its release asset accessible to the runner. A failed
download or checksum prevents startup. **Installed command** skips checkout and
artifact loading; it cannot obtain a JAR through the office manifest.

SWT can merge the Java build workflow first with its initial disabled (`null`)
pin. Deploy the artifact-loader image before promoting that pin or enabling a
direct Java registration. The hourly launcher handles a disabled pin gracefully;
a direct Java registration requires the JAR to exist.

### Catalog access

The API reads `OFFICE_REPOSITORIES` as a JSON map keyed by uppercase office code. Configure the repository and branch to match the checkout used by that office's runner, for example:

```json
{"SWT":{"repository":"USACE-WaterManagement/swt-wm-cwbi-jobs","ref":"cwbi-dev"}}
```

For private repositories, supply a server-side `GITHUB_TOKEN` with read access to repository contents through the deployment's secret configuration. The token is never sent to the browser. The API needs outbound HTTPS access to `api.github.com`. Catalog requests require script administrator access for the selected office. Large, truncated GitHub tree responses are rejected instead of showing an incomplete file list.

Without this configuration or repository access, users can still enter paths manually; Browse reports that files are unavailable and the district GitHub button is disabled. The GitHub button uses the configured repository, not a name inferred from the office code. Browser configuration does not change the runner's checkout configuration.

Help → Script setup (`/events/help/script-files`) explains cloning, adding files, review, and registration. Help → Onboarding (`/events/help/onboarding`) covers job setup and execution.
