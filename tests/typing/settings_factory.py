"""Static regression checks: run Pyright on this file; no services are started."""

from typing import assert_type

from cwms_batch_events.core.settings import (
    ApiSettings,
    DatabaseSettings,
    DispatcherSettings,
    LoggingSettings,
    Settings,
    get_settings,
)


def check_settings_types() -> None:
    assert_type(get_settings(), Settings)
    assert_type(get_settings(Settings), Settings)
    assert_type(get_settings(ApiSettings), ApiSettings)
    assert_type(get_settings(DatabaseSettings), DatabaseSettings)
    assert_type(get_settings(DispatcherSettings), DispatcherSettings)
    assert_type(get_settings(LoggingSettings), LoggingSettings)
    assert_type(get_settings.cache_clear(), None)
