import logging
import sys
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
    users,
    document_scan,
)
from cwms_batch_events.core.settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)

app = FastAPI(root_path=settings.root_path, lifespan=document_scan.lifespan)


@app.middleware("http")
async def private_scan_responses(request, call_next):
    response = await call_next(request)
    if request.url.path.rstrip("/").startswith(
        f"{settings.root_path}/document/scan"
    ) or request.url.path.startswith("/document/scan"):
        response.headers["Cache-Control"] = "no-store"
    return response


origins = r"http://localhost(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origins,
    allow_origins=settings.document_scan_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(about.router)
app.include_router(internal.router)
app.include_router(job_runners.router)
app.include_router(jobs.router)
app.include_router(repository_files.router)
app.include_router(scripts.router)
app.include_router(users.router)
app.include_router(document_scan.router)
