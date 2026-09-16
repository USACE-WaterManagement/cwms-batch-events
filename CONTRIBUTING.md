# Contributions

## Codespaces

GitHub Codespaces is the quickest supported setup path. The repository development container installs the Python and UI dependencies and prepares the Docker network used by `docker-compose.yml`. After creation, run `docker compose up --build` for the API and backing services, and run `npm --prefix ui run dev -- --host 0.0.0.0` in another terminal for the UI.

The default local stack uses mock authentication and local-only service credentials. Do not add production credentials to the development container configuration or tracked files.

### Local Dev Container on Windows

Install and start Docker Desktop in Linux container mode, and ensure Node.js and npm are available. From a PowerShell prompt at the repository root, build and start the development container on the local Docker host with:

```powershell
npx -y @devcontainers/cli up --workspace-folder .
```

Open a shell in the running development container with:

```powershell
npx -y @devcontainers/cli exec --workspace-folder . bash
```

Docker Desktop runs the development container itself. The development container's Docker-in-Docker feature provides the isolated Docker daemon used by the project's Compose stack.

## Pre-reqs
* VM 
* Python 3.12+ (Pref with `pyenv`)
* Docker 
* NodeJS 

## Getting Started

1. Setup the `pyenv` env (Details below)
    1. Run `./setup-pyenv.sh`
2. For each office that you want to install:
    1. Clone the repo with: `git clone https://github.com/usace-watermanagement/swt-wm-cwbi-jobs`
    2. Change directory into the cloned repo
    3. Build the local container for jobs after cloning with: `docker build . -t swt-jobs`
3. Start the API Server **(From the project root)**
    1. Create the `cwms` docker network with: `docker network create cwms`
    2. Start the API server environment with `docker compose up`   
4. Start the Web Interface **(From the project root)**
    1. `cd ui`
    2. Install Packages (NodeJS required): `npm install`
    3. Run the local development vite server: `npm run dev`

## Notes
* Environment configuration
  * The API validates its configuration before loading routers. Set `APP_KEY`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, and `PGHOST`. With real user authentication, also set `AUTH_ENVIRONMENT` (`LOCAL`, `TEST`, or `PROD`) and `CDA_API_ROOT`; `LOCAL` authentication additionally requires `AUTH_HOST`.
  * `DEFAULT_JOB_RUNNER=docker-local` requires `S3_BUCKET`, `S3_ENDPOINT_URL`, and `SQS_ENDPOINT_URL` in the API. The local dispatcher independently requires the database variables, `QUEUE_URL`, `S3_BUCKET`, `S3_ENDPOINT_URL`, and `CDA_API_ROOT`. It does not need `APP_KEY` or user authentication variables. The checked-in Compose file supplies both services' local configuration.
  * Missing or blank environment endpoints and credentials default to `None`. Protocol and application defaults remain explicit: PostgreSQL port `5432`, schema `events`, runner `batch`, realm `cwms`, and existing logging/version defaults. AWS credentials, region, and cloud service endpoint overrides remain optional so the AWS SDK can use its credential and endpoint providers. GitHub browsing credentials remain optional.
  * Core modules retrieve cached settings for their component with `get_settings(...)`; importing logging or Lambda helpers does not validate API or database configuration.
* Type Standardization
  * TypeScript types are generated from the API for use in the frontend using [OpenAPI TypeScript](https://openapi-ts.dev/). 
  * If API types are updated or modified, run `npm run generate:types` to update the type definitions.
* Python Testing
  * Run `pytest` from the project root to execute the Python unit test suite.
  * The suite is configured to report coverage for `cwms_batch_events` and should stay fast and free of external dependencies.
