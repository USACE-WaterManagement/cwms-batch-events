# cwms-batch-events

CWMS Batch Events provides users an API and user interface to execute water management jobs on a manual or event-driven basis.

## Contributions

To get your local environment setup and/or make contributions please see the contributions documentation: [CONTRIBUTING.md](https://github.com/USACE-WaterManagement/cwms-batch-events/blob/cwbi-dev/CONTRIBUTING.md)


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
