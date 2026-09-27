from cwms_batch_events.core.job_database.base import JobDatabase
from cwms_batch_events.core.job_logger.base import JobLogger
from cwms_batch_events.local.executor import LocalExecutor
from cwms_batch_events.core.models import JobMessage


class MissingJobRunner(Exception):
    pass


class LocalJobDispatcher:
    def __init__(self, db: JobDatabase, logger: JobLogger):
        self.db = db
        self.logger = logger

    def dispatch_job(self, message: JobMessage):
        if message.requested_by.source == "scheduler" and not self.db.claim_scheduled_dispatch(message.job_id):
            return
        if message.runner_type == "docker-local":
            runner = LocalExecutor(self.db, self.logger)
        else:
            raise ValueError("LocalJobDispatcher only supports LocalExecutor")

        runner.run_job(message)
