# cwms-batch-events

CWMS Batch Events provides users an API and user interface to execute water management jobs on a manual or event-driven basis.

## Managing and running scripts

Scripts Manager provides **Details**, **Run job**, and **Job runs** tabs for each script.
Use **Run job** or **View job runs** at the end of a row to open the matching tab.
**Job History** shares runs and logs across your CWMS offices, with readable submitter names
and Manual/Scheduled badges when the trigger was recorded. See [run history and logs](docs/job-logs.md)
for migration and scheduler setup. Script execution roles are optional;
an empty role list requires office access with no additional CDA execution role.
See the [script manager guide](docs/script-manager.md) and [registered commands](docs/registered-commands.md)
for setup, Bash examples, and access rules. Updated screenshots are included in the in-app Help pages.

## Server logs

Signed-in users can open the header checkmark or warning indicator to view API
server logs, filter loaded entries by level, and expand CloudWatch event details.
See [server logs](docs/server-logs.md) for endpoint and deployment configuration.

## Environment selector URLs

The header environment selector uses the following GitHub Actions repository variables
when the UI is built:

| Variable | Purpose |
| --- | --- |
| `BATCH_EVENTS_DEV_URL` | Dev Batch Events UI URL |
| `BATCH_EVENTS_TEST_URL` | Test Batch Events UI URL |
| `BATCH_EVENTS_PROD_URL` | Production Batch Events UI URL |

## Contributions

To get your local environment setup and/or make contributions please see the contributions documentation: [CONTRIBUTING.md](https://github.com/USACE-WaterManagement/cwms-batch-events/blob/cwbi-dev/CONTRIBUTING.md)

### GitHub Codespaces

The repository's development container prepares a complete environment for GitHub Codespaces, including Python 3.12 and all test dependencies, Node.js 22 and the UI dependencies, Docker Compose with an isolated Docker daemon, the external `cwms` Docker network required by the local stack, and editor support for Python, TypeScript, ESLint, and Docker.

Create a Codespace for this repository and wait for its setup to finish. The mounted checkout is used directly for Python imports, and `ui/node_modules` is installed from the committed lockfile. No credentials or repository secrets are required for the default mock-user development flow.

Verify the environment with:

```bash
python -m pytest -q
npm --prefix ui run lint
npm --prefix ui run build
docker compose config --quiet
```

Start the local service stack and UI in separate terminals:

```bash
docker compose up --build
npm --prefix ui run dev -- --host 0.0.0.0
```

Codespaces forwards the UI, API, MinIO console, and ElasticMQ UI ports automatically. Use the forwarded URLs shown in the **Ports** panel rather than assuming `localhost` from outside the Codespace.

#### Run the Dev Container locally on Windows

Install and start Docker Desktop in Linux container mode, and ensure Node.js and npm are available. From a PowerShell prompt at the repository root, build and start the development container on the local Docker host with:

```powershell
npx -y @devcontainers/cli up --workspace-folder .
```

Open a shell in the running development container with:

```powershell
npx -y @devcontainers/cli exec --workspace-folder . bash
```

Docker Desktop runs the development container itself. The development container's Docker-in-Docker feature provides the isolated Docker daemon used by the project's Compose stack.


### Local Development Setup

#### Critical URLs
page | url
---- | ---
ElasticMQ Web Interface | http://localhost:9325
Minio Web Interface | http://localhost:9001
Web Dev Server | http://localhost:5173
Swagger Docs | http://localhost:8000/docs
Redoc | http://localhost:8000/redoc

#### Python
For the best experience, [pyenv](https://github.com/pyenv/pyenv) is recommended for install instructions.  If pyenv is available, the `setup-pyenv.sh` script is provided to create a virtual environment and install the necessary local dev requirements. Be sure to install `gcc` for your environment.

#### Authentication
By default, the local instance of the API uses a mock user account.  This account has script-execute permissions for all districts.  As a result, the API will return scripts for all offices that contain a corresponding script catalog within the minio instance.

#### Script Containers
The API will reference district script docker images that exist locally by the name `[office-code]-jobs`, e.g. `lrh-jobs`.  These can be created by cloning the corresponding district jobs repo, e.g. [lrh-wm-cwbi-jobs](https://github.com/USACE-WaterManagement/lrh-wm-cwbi-jobs), and building the images from the local dockerfile with `docker build . -t [office-code]-jobs`.

#### Script Catalogs
Available district scripts are managed within the cwms-batch application itself using the "Scripts Manager" available through the Web UI or directly through API endpoints.

#### User Interface
The user interface is deployed locally as a vite development server.  To run it, simply enter the `ui` directory and run `npm run dev`.

#### Failed-job email notifications

Batch Events stores canonical, office-scoped email templates and one active
failed-job rule per script. A template is reusable content only: creating or
editing one never sends email and cannot globally enable or suppress script
alerts. Administrators enable **Email when this script fails**, select one
template, and choose recipients in Scripts Manager. Referenced templates cannot
be deleted until their scripts are reassigned.

Reusable recipient lists are owned by CDA, not Batch Events. A rule stores the
CDA list ID together with the script office, so the effective list identity is
`(office, user-list-id)`. Users create and maintain list membership in the
authenticated CDA User Lists UI; Batch Events only selects and resolves those
lists.

CDA resolution at job-failure time uses a registered confidential Keycloak
service account with `CDA_CLIENT_ID` and `CDA_CLIENT_SECRET`. `CDA_TOKEN_URL` can
override the normal token URL derived from `AUTH_HOST` and `AUTH_REALM`, and
`CDA_TOKEN_HOST_HEADER` is available for local proxy routing. API keys are not
used for this workflow.

Local Compose defaults these settings to the local-only
`cwms-batch-notifications-local` Keycloak service account seeded by the CDA
development realm. Override `CDA_CLIENT_ID`, `CDA_CLIENT_SECRET`, or
`CDA_TOKEN_URL`, or `CDA_TOKEN_HOST_HEADER` in the shell when testing against a
different CDA environment. The host-header default preserves CDA's public
localhost issuer while Batch Events reaches Keycloak through Docker's internal
`traefik` hostname. The local credentials are development fixtures and must not
be reused outside localhost.

The notification worker uses `NOTIFICATION_DELIVERY_MODE=log` locally, which
records only delivery metadata and does not log recipients or message contents.
Set the mode to `ses` and provide `NOTIFICATION_FROM_ADDRESS` for AWS SES
delivery. Failed or invalid deliveries remain on SQS for retry and eventual
dead-letter handling. Templates are rendered in a restricted Jinja sandbox and
may reference only the documented job-failure fields exposed by Batch Events.

The queue carries a version 1.1 rendered-email envelope. It includes the message
type and source along with resolved recipients and rendered content, so the
delivery worker does not query Batch Events, CDA, or a template store. This
contract can support future authorized producers and non-job email categories.
The worker temporarily accepts version 1.0 messages during rollout. See
[ADR 0001](docs/adr/0001-render-email-before-queueing.md).

AWS deployments use the SQS-triggered handler in
`cwms_batch_events/lambdas/send_notification/handler.py`. The local Compose
notifier remains a long-polling ElasticMQ worker with log-only delivery. The
notification queue's event source mapping must enable partial batch responses
(`ReportBatchItemFailures`) so only failed deliveries are retried.
