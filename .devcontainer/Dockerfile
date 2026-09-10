FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm

# The upstream image currently carries a stale Yarn apt source. Node is installed
# by the maintained dev-container feature, so this source is not needed here.
RUN rm -f /etc/apt/sources.list.d/yarn.list

COPY requirements.txt requirements-dev.txt /tmp/cwms-batch-events-requirements/

RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir \
        --requirement /tmp/cwms-batch-events-requirements/requirements.txt \
        --requirement /tmp/cwms-batch-events-requirements/requirements-dev.txt \
    && rm -rf /tmp/cwms-batch-events-requirements
