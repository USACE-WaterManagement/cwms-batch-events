from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    api_version: str = "local"
    app_key: str = ""
    auth_environment: str = ""
    auth_host: str = "http://traefik/auth"
    auth_realm: str = "cwms"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_default_region: str | None = None
    cda_api_root: str = "http://traefik/cwms-data/"
    cda_bearer_token: str = ""
    cda_client_id: str = ""
    cda_client_secret: str = ""
    cda_token_url: str = ""
    cda_token_host_header: str = ""
    default_job_runner: str = "batch"
    deployment_environment: str = "local"
    build_revision: str = "local"
    build_time: str | None = None
    dynamodb_host: str = "http://dynamodb:9010"
    pguser: str = ""
    pgpassword: str = ""
    pgdatabase: str = "postgres"
    pghost: str = "db"
    pgport: int = 5432
    mock_user: bool = False
    notification_queue_name: str = "cwms-batch-events-notifications"
    notification_delivery_mode: str = "log"
    notification_from_address: str = ""
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
