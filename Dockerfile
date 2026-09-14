ARG PYTHON_VERSION=3.13.15
ARG ALPINE_VERSION=3.23

# Unpack static veraPDF resources at image build time. Running from an archive
# would make its font resource loader create temporary files while scanning.
FROM python:3.13-slim AS scanner-resources
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jre-headless unzip && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838 https://software.verapdf.org/releases/1.30/verapdf-greenfield-1.30.2-installer.zip /installer.zip
COPY scanner/install.xml /install.xml
RUN unzip /installer.zip -d /installer && java -jar /installer/*/verapdf-izpack-installer-*.jar /install.xml
RUN python -c "import zipfile; z=zipfile.ZipFile('/opt/verapdf/bin/cli-1.30.2.jar'); [z.extract(n, '/opt/scanner/classes') for n in z.namelist() if not n.endswith('module-info.class')]"
FROM maven:3.9.11-eclipse-temurin-21 AS scanner-builder
COPY --from=scanner-resources /opt/scanner/classes /opt/scanner/classes
COPY scanner/DocumentScanner.java /src/DocumentScanner.java
RUN javac -cp /opt/scanner/classes -d /opt/scanner/classes /src/DocumentScanner.java

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
RUN apk add --no-cache openjdk21-jre-headless

RUN addgroup --system appuser \
 && adduser --system --ingroup appuser --uid 10001 appuser

WORKDIR /code

COPY --from=builder /usr/local /usr/local
COPY --from=scanner-builder /opt/scanner /opt/scanner
COPY scanner/LICENSE.MPL scanner/NOTICE.md /opt/scanner/

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
