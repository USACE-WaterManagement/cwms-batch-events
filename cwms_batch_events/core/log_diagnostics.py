"""Opt-in dev diagnostics. Never log output, cursor tokens, or credentials."""
import logging

from cwms_batch_events.core.settings import settings

logger = logging.getLogger("cwms_batch_events.job_log_timing")


def configure_log_diagnostics():
    logger.setLevel(logging.DEBUG if enabled() else logging.INFO)


def enabled() -> bool:
    return settings.deployment_environment == "dev" and settings.log_level.upper() == "DEBUG"


def log_timing(event: str, **fields):
    # Guard each call as well as configuration: even a globally enabled DEBUG
    # logger must not expose these diagnostics in local, test, or production.
    if enabled():
        logger.debug("job_log_timing event=%s %s", event,
                     " ".join(f"{key}={value}" for key, value in fields.items()))
