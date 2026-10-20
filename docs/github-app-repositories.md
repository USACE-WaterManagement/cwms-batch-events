# District repository browsing

The API uses a GitHub App to list files. It derives the repository as
`USACE-WaterManagement/<office>-wm-cwbi-jobs`. Development, test, and production
use `cwbi-dev`, `cwbi-test`, and `cwbi-prod`. `GITHUB_REPOSITORY_REF` overrides the
branch; existing `OFFICE_REPOSITORIES` entries override individual repositories
and branches. Neither setting contains credentials. The old `GITHUB_TOKEN`
setting is no longer used for API file browsing.

## AWS setup

### ECS-injected credentials

Install a GitHub App with **Contents: read** access on the district repositories.
The API accepts these container environment variables, including ECS secret injection:

| Container variable | App secret JSON field in the current CDK configuration |
| --- | --- |
| `GITHUB_APP_PRIVATE_KEY` | `GITHUB_TOKEN` |
| `GITHUB_APP_ID` | `GITHUB_APP_ID` |
| `GITHUB_INSTALLATION_ID` | `GITHUB_INSTALLATION_ID` |

Despite the existing secret field name `GITHUB_TOKEN`, its value must be the App's
PEM private key, not a PAT or installation token. Preserve the PEM's line breaks.
The API reads `GITHUB_APP_PRIVATE_KEY`, not `GITHUB_TOKEN`.

All three variables must be set together. They take precedence over
`GITHUB_APP_SECRET_ID`; partial configuration returns a warning instead of falling
back to another credential. The private key is masked in settings representations.
ECS needs secret-read permissions on its **task execution role** for injection;
the API does not call Secrets Manager in this mode. Deploy new tasks after rotating
injected credentials. Outbound HTTPS access to `api.github.com` is required.

### Alternative: API reads a secret

Install a GitHub App with **Contents: read** access on the district repositories.
Create an AWS Secrets Manager secret with this JSON structure:

```json
{
  "app_id": "123456",
  "installation_id": "789012",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
}
```

Set `GITHUB_APP_SECRET_ID` on the API to the secret name or ARN. Grant the API
**task role** `secretsmanager:GetSecretValue` on that secret. If it uses a customer
managed KMS key, also grant `kms:Decrypt` on that key. The API needs outbound
HTTPS access to Secrets Manager and `api.github.com`.

Store the App private key, not a generated installation token. The API signs an
App JWT, requests a read-only installation token, and caches it until two minutes
before expiry. In secret-reference mode it rereads the secret when refreshing, so key rotation does not
require rebuilding the image. GitHub installation tokens expire after one hour:
[GitHub authentication documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).

Missing credentials, denied access, and incomplete file catalogs appear in the
signed-in warnings dialog. File browsing becomes unavailable; users can still
type and save paths. This App is for API browsing. Runner checkout and Java
artifact downloads continue to use the runner's separate credentials.

## Local sample catalog

For a standalone demo without Docker or a database, run from the repository root:

```powershell
python -m tools.repository_demo
```

In another terminal, start the UI with its local mock login:

```powershell
cd ui
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/events/scripts-manager`, click Login, and select SWT.
The demo starts with missing credentials and one example script. Saves
use the real API validation but remain in memory and disappear on restart. Jobs
cannot execute. Use the local API's `/docs` page to switch `POST /_demo/scenario`
between `sample-files` and `missing-credentials`, then reload the UI.

For the existing Docker stack instead:

```powershell
docker compose -f docker-compose.yml -f docker-compose.repository-mock.yml up -d api
```

The UI labels these as sample paths. No GitHub or AWS request is made for the
catalog. Mocking is honored only with `DEPLOYMENT_ENVIRONMENT=local`. It does not
provide sample files to actual jobs or mock the database.

To test the missing-credentials warning, run the API with
`REPOSITORY_MOCK_MODE=false` and leave `GITHUB_APP_SECRET_ID` empty.

## Local access to real repositories

Run the API with `REPOSITORY_MOCK_MODE=false`, `GITHUB_APP_SECRET_ID` set, and a
local AWS profile that can read the secret (for example, authenticate using
`aws sso login --profile <profile>` and set `AWS_PROFILE`). The same server-side
App flow works from localhost. Do not use the local Compose stack's dummy AWS
credentials for this. A container needs its own read-only AWS profile mount and
credential configuration; running the API directly can use the normal SDK
credential chain. Never put App credentials in Vite variables or browser storage.
