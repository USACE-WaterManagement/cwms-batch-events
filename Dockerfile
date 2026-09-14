ARG PYTHON_VERSION=3.13.15
ARG ALPINE_VERSION=3.23

# Builder

FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION} AS builder

RUN apk add --no-cache build-base postgresql-dev

WORKDIR /code

ARG REQ_FILE=requirements.txt

COPY ./requirements.txt ./requirements.txt
COPY ./requirements-dev.txt ./requirements-dev.txt

RUN pip install --no-cache-dir -r ${REQ_FILE}


# Runtime

FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION}

ARG API_VERSION=local
ARG BUILD_REVISION=local
ARG BUILD_TIME
ARG DEPLOYMENT_ENVIRONMENT=local

ENV API_VERSION=${API_VERSION} \
    BUILD_REVISION=${BUILD_REVISION} \
    BUILD_TIME=${BUILD_TIME} \
    DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT}

RUN apk upgrade --no-cache

RUN addgroup --system appuser \
 && adduser --system --ingroup appuser --uid 10001 appuser

WORKDIR /code

COPY --from=builder /usr/local /usr/local

# Packaging tools are not needed at runtime and include vendored libraries that
# are independently reported by container vulnerability scanners.
RUN python -m pip uninstall --yes pip setuptools wheel

COPY ./cwms_batch_events ./cwms_batch_events

RUN chown -R appuser:appuser /code
USER appuser

EXPOSE 8000

CMD ["gunicorn", \
    "-w", "2", \
    "-k", "uvicorn.workers.UvicornWorker", \
    "cwms_batch_events.api.main:app", \
    "--bind", "0.0.0.0:8000", \
    "--env", "ROOT_PATH=/api", \
    "--access-logfile", "-", \
    "--error-logfile", "-"]
