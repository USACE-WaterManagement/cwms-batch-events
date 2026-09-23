# Registered commands

Script administrators can select a district repository file or an installed command in Scripts Manager. Jobs use the office AWS Batch job definition, credentials, queue, and logs. Use the row's **Run job** action to review and submit the saved settings, or **View job runs** to review your runs. See the [script manager guide](script-manager.md) for the tab workflow and optional execution roles.

| Source | Runtime / executable | Path / arguments | Container command |
| --- | --- | --- | --- |
| District GitHub repository | Python | `python/report.py` | `python /jobs/python/report.py` |
| District GitHub repository | Java JAR | `lib/report.jar` | `java -jar /jobs/lib/report.jar` |
| District GitHub repository | Bash | `bin/report.sh` | `bash /jobs/bin/report.sh` |
| Installed command | `cwms-cli` | `blob`, `upload`, `--help` | `cwms-cli blob upload --help` |

Enter one argument per line in the form. The API stores `commandArgs` as an array, preserving spaces and literal shell characters. Commands execute directly; shell expressions require an explicit `bash` executable with `-lc` and the expression as separate arguments. The runtime selector applies to repository files; an installed command supplies its executable directly.

Installed commands skip district repository checkout and repository Python dependency installation. Their executable and files, including any JAR, must be available in the container before execution.

For example, `cwms-cli` is already installed in the runner image. A job can create a file and upload it as a CWMS blob without a district script in GitHub, avoiding the checkout and dependency installation time.

In Scripts Manager, register the script with these values:

| Field | Value |
| --- | --- |
| Office | `SWT` |
| Name | Upload job status |
| Source | Installed command |
| Executable | `bash` |

Enter these two lines in **Arguments**:

```text
-lc
printf 'Job completed\n' > /tmp/job-status.txt && cwms-cli blob upload --input-file /tmp/job-status.txt --blob-id JOB-STATUS --media-type text/plain --office SWT
```

The second line is one argument. Bash runs the upload only if file creation succeeds. The job environment supplies `CDA_API_ROOT` and `CDA_API_KEY` for the target CDA service. Use a unique blob ID for each output, or add `--overwrite` to replace an existing blob. Save the registration, select **Run job** on its row, then **Submit job** in the selected script. **Job runs** opens the result; **Job History** lists your runs across scripts.

Configuration version, runtime, path, and arguments are copied into the job record and queue message when submitted, so later script edits do not change an already submitted job. Version 2 uses the same command construction for local Docker execution and AWS Batch.

For a one-time override, `POST /jobs` accepts `commandArgs` alongside `scriptId`.
Omitting `commandArgs` or sending `null` uses the saved arguments; `[]` runs without
arguments. The override replaces the entire argument array on the job snapshot
and does not update the script. Execution permissions and the saved executable,
runtime, and path still apply. Custom arguments require configuration version 2.

## Configuration versions

New registrations and explicit edits use **v2** (`configVersion: 2` in the API).
Clients may omit the version on POST/PUT; they cannot create v1 registrations.
Saving a legacy script validates all execution fields against v2 and upgrades that
registration to v2. Reading or running it never upgrades it.

Flyway migration `V1_01_15` adds `config_version INTEGER NOT NULL DEFAULT 1`
to both scripts and jobs. All existing unversioned rows are classified as v1,
including rows saved between the registered-runtime release and this migration.
There is no reliable version marker in those rows. The application explicitly
supplies v2 on new registrations and saves; the database default stays 1.
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
