from functools import lru_cache
from pydantic import BaseModel, Field, SecretStr
from pydantic_settings import BaseSettings


class RepositorySettings(BaseModel):
    repository: str = Field(pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    ref: str = Field(min_length=1)


class Settings(BaseSettings):
    office_repositories: dict[str, RepositorySettings] = {}
    github_token: SecretStr = SecretStr("")
    github_app_secret_id: str = ""
    github_repository_ref: str = ""
    repository_mock_mode: bool = False
    api_version: str = "local"
    app_key: str = ""
    auth_environment: str = ""
    auth_host: str = "http://traefik/auth"
    auth_realm: str = "cwms"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_default_region: str | None = None
    cda_api_root: str = "http://traefik/cwms-data/"
    default_job_runner: str = "batch"
    deployment_environment: str = "local"
    log_level: str = "INFO"
    server_log_group: str = "ecs/cwms-batch/cwms-batch-events-api"
    server_log_stream_prefix: str = "ecs/cwms-batch-events-api/"
    build_revision: str = "local"
    build_time: str | None = None
    dynamodb_host: str = "http://dynamodb:9010"
    pguser: str = ""
    pgpassword: str = ""
    pgdatabase: str = "postgres"
    pghost: str = "db"
    pgport: int = 5432
    mock_user: bool = False
    root_path: str = ""
    # CWBI deployments use "events"; local Docker overrides this setting.
    database_schema: str = "events"
    s3_bucket: str = ""
    s3_endpoint_url: str | None = None
    sqs_endpoint_url: str | None = None


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()
