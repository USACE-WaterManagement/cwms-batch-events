import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from cwms_batch_events.api.routers import (
    about,
    health,
    internal,
    job_runners,
    jobs,
    repository_files,
    scripts,
    server_logs,
    users,
)
from cwms_batch_events.core.settings import settings
from cwms_batch_events.core.log_diagnostics import configure_log_diagnostics
from cwms_batch_events.core.logging_config import configure_logging
from cwms_batch_events.api.request_logging import RequestLoggingMiddleware

configure_logging(api=True)
configure_log_diagnostics()
logging.getLogger(__name__).info("API initialized", extra={"event": "api_initialized"})

app = FastAPI(root_path=settings.root_path)


origins = r"http://localhost(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(health.router)
app.include_router(about.router)
app.include_router(internal.router)
app.include_router(job_runners.router)
app.include_router(jobs.router)
app.include_router(repository_files.router)
app.include_router(scripts.router)
app.include_router(server_logs.router)
app.include_router(users.router)
