"""Powertools owns Lambda context; retain the application's safe log fields."""
from copy import copy
from functools import wraps

from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging.formatter import LambdaPowertoolsFormatter

from cwms_batch_events.core.logging_config import bind_log_context, common_fields, exception_fields
from cwms_batch_events.core.settings import settings


class SafeLambdaFormatter(LambdaPowertoolsFormatter):
    def __init__(self, service: str):
        super().__init__(service=service, use_rfc3339=True, serialize_stacktrace=False)
        self.service_name = service

    def format(self, record):
        safe = copy(record)
        safe.__dict__.update(common_fields(record, self.service_name))
        safe.__dict__.update(exception_fields(record))
        safe.exc_info = safe.exc_text = safe.stack_info = None
        return super().format(safe)


def lambda_logger(service: str) -> Logger:
    level = settings.log_level.upper()
    return Logger(service=service, level=level if level in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO",
                  logger_formatter=SafeLambdaFormatter(service))


def with_lambda_logging(logger: Logger):
    def decorate(handler):
        @logger.inject_lambda_context(log_event=False, clear_state=True)
        @wraps(handler)
        def invoke(event, context):
            keys = logger.get_current_keys()
            # Give ordinary library loggers the same invocation context too.
            with bind_log_context(service=logger.service, **{
                key: keys[key] for key in ("cold_start", "function_name", "function_arn", "function_request_id", "function_memory_size") if key in keys
            }):
                return handler(event, context)
        return invoke
    return decorate
