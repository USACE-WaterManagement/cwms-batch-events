import logging
from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_logger.base import JobLogger
from cwms_batch_events.core.execution import command_for_payload
from cwms_batch_events.core.models import JobMessage, JobStatus
from cwms_batch_events.core.settings import settings
from cwms_batch_events.core.job_correlation import runner_environment
from cwms_batch_events.core.logging_config import bind_log_context

CDA_API_ROOT = settings.cda_api_root
logger = logging.getLogger(__name__)


class LocalExecutor:
    def __init__(self, db: JobDatabase, logger: JobLogger):
        self.db = db
        self.logger = logger

    def run_job(self, message: JobMessage):
        with bind_log_context(service="cwms-batch-events-local-runner", job_id=str(message.job_id), request_id=message.request_id):
            return self._run_job(message)

    def _run_job(self, message: JobMessage):
        from docker import DockerClient
        from docker.client import from_env

        client: DockerClient = from_env()
        container = None

        try:
            container = client.containers.run(
                image=f"{message.payload.office}-jobs",
                command=command_for_payload(message.payload),
                detach=True,
                stderr=True,
                environment=[
                    *(f"{key}={value}" for key, value in runner_environment(message).items()),
                    f"OFFICE={message.payload.office}",
                    "GITHUB_BRANCH=cwbi-dev",
                    "ENVIRONMENT=cwbi-dev",
                    f"SKIP_GIT_CLONE={str(message.payload.execution_type == 'command').lower()}",
                    f"CDA_API_ROOT={CDA_API_ROOT}",
                ],
            )

            self.db.update_job_status(message.job_id, JobStatus.RUNNING)
            logger.info("Local job started", extra={"event": "local_job_started", "job_id": message.job_id})

            result = container.wait()
            status_code = result["StatusCode"]
            logger.log(logging.INFO if status_code == 0 else logging.WARNING, "Local job exited", extra={"event": "local_job_exited", "job_id": message.job_id, "exit_code": status_code})

            logs = container.logs().decode("utf-8")
            self.logger.push_logs_for_job(message.job_id, logs)

            if status_code == 0:
                self.db.update_job_status(message.job_id, JobStatus.COMPLETED)
            else:
                self.db.update_job_status(message.job_id, JobStatus.FAILED)

        except Exception:
            logger.exception("Local job execution failed", extra={"event": "local_job_failed", "job_id": message.job_id})
            self.db.update_job_status(message.job_id, JobStatus.FAILED)
            raise

        finally:
            if container:
                try:
                    container.remove()
                except Exception as exc:
                    logger.warning("Local job container cleanup failed", extra={"event": "local_cleanup_failed", "job_id": message.job_id, "error_type": type(exc).__name__})
