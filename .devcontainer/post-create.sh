#!/usr/bin/env bash
set -euo pipefail

npm --prefix ui ci

for attempt in {1..30}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    echo "Docker did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

docker network inspect cwms >/dev/null 2>&1 || docker network create cwms >/dev/null

python --version
node --version
npm --version
docker compose version
