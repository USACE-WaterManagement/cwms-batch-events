ARG PYTHON_VERSION=3.13.15
ARG ALPINE_VERSION=3.23

FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION} AS builder

WORKDIR /app

RUN apk add --no-cache build-base postgresql-dev

COPY requirements.txt .
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt

FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION}

RUN apk upgrade --no-cache

WORKDIR /app

COPY --from=builder /usr/local /usr/local

# Packaging tools are not needed at runtime and include vendored libraries that
# are independently reported by container vulnerability scanners.
RUN python -m pip uninstall --yes pip setuptools wheel

COPY cwms_batch_events ./cwms_batch_events
COPY infra/dispatcher ./infra/dispatcher

ENV PYTHONPATH=/app

CMD ["python", "-u", "infra/dispatcher/dispatcher_loop.py"]
