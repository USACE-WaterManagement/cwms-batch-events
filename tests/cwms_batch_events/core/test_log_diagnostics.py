import logging

import pytest

from cwms_batch_events.core import log_diagnostics


@pytest.mark.parametrize("environment,level,expected", [
    ("dev", "DEBUG", True), ("dev", "INFO", False),
    ("test", "DEBUG", False), ("prod", "DEBUG", False),
    ("local", "DEBUG", False), ("cwbi-prod", "DEBUG", False),
])
def test_diagnostics_require_both_dev_and_debug(monkeypatch, caplog, environment, level, expected):
    monkeypatch.setattr(log_diagnostics.settings, "deployment_environment", environment)
    monkeypatch.setattr(log_diagnostics.settings, "log_level", level)
    log_diagnostics.configure_log_diagnostics()
    assert log_diagnostics.logger.level == (logging.DEBUG if expected else logging.INFO)
    # Even externally enabling every DEBUG logger must not bypass the env gate.
    with caplog.at_level(logging.DEBUG, logger=log_diagnostics.logger.name):
        log_diagnostics.log_timing("probe", job_id="example", events=2)
    assert bool(caplog.records) is expected
