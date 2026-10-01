from functools import lru_cache
from typing import Literal, Protocol, TypeVar, cast, overload

from pydantic import BaseModel, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings


class RepositorySettings(BaseModel):
    repository: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    ref: str = Field(min_length=1)


class ComponentSettings(BaseSettings):
    @model_validator(mode="before")
    @classmethod
    def normalize_optional_strings(cls, values):
        # Treat blank optional configuration as missing. Nonblank values,
        # including passwords with leading/trailing spaces, are preserved.
        if isinstance(values, dict):
            values = dict(values)
            for name, field in cls.model_fields.items():
                value = values.get(name)
                if field.default is None and isinstance(value, str) and not value.strip():
                    values[name] = None
        return values

    def require(self, *names: str):
        missing = [name.upper() for name in names if getattr(self, name) is None]
        if missing:
            raise ValueError(f"{', '.join(missing)} must be configured for {type(self).__name__}")
        return self


class LoggingSettings(ComponentSettings):
    deployment_environment: str = "local"
    log_level: str = "INFO"
    service_name: str = "cwms-batch-events-api"
    build_revision: str = "local"
    build_time: str | None = None


class AwsSettings(ComponentSettings):
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_default_region: str | None = None


class StorageSettings(AwsSettings):
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None


class DatabaseSettings(ComponentSettings):
    pguser: str | None = None
    pgpassword: str | None = None
    pgdatabase: str | None = None
    pghost: str | None = None
    pgport: int = Field(default=5432, ge=1, le=65535)
    # CWBI deployments use "events". Local Docker overrides this setting.
    database_schema: str = "events"

    @model_validator(mode="after")
    def validate_database(self):
        return self.require("pguser", "pgpassword", "pgdatabase", "pghost")


class ExecutorSettings(ComponentSettings):
    cda_api_root: str | None = None
    cda_bearer_token: str = ""
    cda_client_id: str = ""
    cda_client_secret: str = ""
    cda_token_url: str = ""
    cda_token_host_header: str = ""


class RunnerSettings(ComponentSettings):
    default_job_runner: Literal["batch", "docker-local"] = "batch"
    sqs_endpoint_url: str | None = None
    notification_queue_name: str = "cwms-batch-events-notifications"
    notification_delivery_mode: str = "log"
    notification_from_address: str = ""


class NotificationSettings(ComponentSettings):
    sqs_endpoint_url: str | None = None
    aws_default_region: str = "us-east-1"
    aws_access_key_id: str = "testing"
    aws_secret_access_key: str = "testing"
    notification_queue_name: str = "cwms-batch-events-notifications"
    notification_delivery_mode: str = "log"
    notification_from_address: str = ""


class Settings(LoggingSettings, StorageSettings, ExecutorSettings, RunnerSettings):
    """API options. Required dependencies are checked by ApiSettings at startup."""

    office_repositories: dict[str, RepositorySettings] = {}
    base_image_repository: str = "USACE/cwbi-wm-images"
    base_image_ref: str = "cwbi-dev"
    github_token: SecretStr = SecretStr("")
    github_app_secret_id: str = ""
    github_app_id: str = ""
    github_installation_id: str = ""
    github_app_private_key: SecretStr = SecretStr("")
    github_repository_ref: str = ""
    repository_mock_mode: bool = False
    scheduler_enabled: bool = True
    dispatch_watchdog_enabled: bool = True
    dispatch_timeout_minutes: int = Field(default=60, ge=1)
    cancellation_watchdog_enabled: bool = True
    cancellation_timeout_minutes: int = Field(default=15, ge=1)
    api_version: str = "local"
    app_key: str | None = None
    auth_environment: str | None = None
    auth_host: str | None = None
    auth_realm: str = "cwms"
    server_log_group: str = "ecs/cwms-batch/cwms-batch-events-api"
    server_log_stream_prefix: str = "ecs/cwms-batch-events-api/"
    mock_user: bool = False
    root_path: str | None = None
    rate_limit_requests_per_minute: int = Field(default=120, ge=1, le=10000)
    rate_limit_job_submissions_per_minute: int = Field(default=10, ge=1, le=1000)
    rate_limit_documentation_url: str = "/events/about/rate-limits"
    database_schema: str = "events"

    @property
    def fastapi_root_path(self) -> str:
        return self.root_path or ""


class DynamoSettings(AwsSettings):
    dynamodb_host: str | None = None


class ApiSettings(Settings, DatabaseSettings):
    @model_validator(mode="after")
    def validate_api(self):
        self.require("app_key")
        if self.mock_user and self.deployment_environment not in {"local", "test"}:
            raise ValueError("MOCK_USER is only permitted for local or test deployments")
        if not self.mock_user:
            self.require("auth_environment", "cda_api_root")
            if self.auth_environment not in {"LOCAL", "TEST", "PROD"}:
                raise ValueError("AUTH_ENVIRONMENT must be LOCAL, TEST, or PROD")
            if self.auth_environment == "LOCAL":
                self.require("auth_host")
        if self.default_job_runner == "docker-local":
            self.require("s3_bucket", "s3_endpoint_url", "sqs_endpoint_url")
        return self


class DispatcherSettings(DatabaseSettings, StorageSettings, ExecutorSettings):
    queue_url: str | None = None

    @model_validator(mode="after")
    def validate_dispatcher(self):
        return self.require("queue_url", "s3_bucket", "s3_endpoint_url", "cda_api_root")


SettingsT = TypeVar("SettingsT", bound=ComponentSettings)


class _SettingsFactory(Protocol):
    @overload
    def __call__(self) -> Settings: ...

    @overload
    def __call__(self, settings_type: type[SettingsT]) -> SettingsT: ...

    def cache_clear(self) -> None: ...


@lru_cache
def _get_settings(settings_type: type[ComponentSettings] = Settings) -> ComponentSettings:
    """Load only the validation required by the calling component."""
    return settings_type()


# lru_cache's return annotation does not preserve the class-to-instance relation.
# Describe that relation without changing its runtime cache or cache_clear API.
get_settings = cast(_SettingsFactory, _get_settings)


class _SettingsProxy:
    def __getattr__(self, name):
        if name in {"sqs_endpoint_url", "aws_default_region", "aws_access_key_id", "aws_secret_access_key", "notification_queue_name", "notification_delivery_mode", "notification_from_address"}:
            return getattr(get_settings(NotificationSettings), name)
        if name in {"cda_api_root", "cda_bearer_token", "cda_client_id", "cda_client_secret", "cda_token_url", "cda_token_host_header"}:
            return getattr(get_settings(ExecutorSettings), name)
        if name in {"aws_access_key_id", "aws_secret_access_key"}:
            return getattr(get_settings(AwsSettings), name)
        return getattr(get_settings(), name)


settings = _SettingsProxy()
