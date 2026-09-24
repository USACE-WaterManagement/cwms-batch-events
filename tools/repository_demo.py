"""Loopback-only, in-memory demo: python -m tools.repository_demo.

Uses the real script validation and repository routes without AWS, GitHub, or a
database. Never load this module as the deployed API application.
"""
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import NoResultFound

from cwms_batch_events.api.dependencies import get_current_user, get_job_database
from cwms_batch_events.api.routers import repository_files, scripts, users
from cwms_batch_events.core.auth.user.models import User
from cwms_batch_events.core.models import ScriptCreate, ScriptRead, ScriptUpdate
from cwms_batch_events.core.settings import get_settings

settings = get_settings()


class DemoScripts:
    def __init__(self):
        self.lock = RLock()
        self.scripts: dict[UUID, ScriptRead] = {}
        now = datetime.now(timezone.utc)
        legacy = ScriptRead(
            id=uuid4(), office="SWT", name="SWT example report", slug="swt-example-report",
            description="Local example for manual entry and repository browsing.",
            repo_path="python/reports/example.py", roles=["CWMS Users"],
            created_time=now, updated_time=now,
        )
        self.scripts[legacy.id] = legacy

    def get_scripts_for_office(self, office):
        with self.lock:
            return [script for script in self.scripts.values() if script.office == office]

    def retrieve_script_catalog(self, roles):
        with self.lock:
            return [script for script in self.scripts.values() if script.active and
                    any(role in roles.get(script.office, []) for role in script.roles)]

    def store_script(self, payload: ScriptCreate, actor=None):
        with self.lock:
            now = datetime.now(timezone.utc)
            script = ScriptRead(**payload.model_dump(by_alias=False), id=uuid4(),
                                slug=f"demo-{uuid4().hex[:8]}", created_time=now, updated_time=now)
            self.scripts[script.id] = script
            return script

    def _allowed_script(self, script_id, admin_offices):
        script = self.scripts.get(script_id)
        if script is None:
            raise NoResultFound()
        if script.office not in admin_offices:
            raise PermissionError("Office access is required")
        return script

    def update_script(self, script_id, payload: ScriptUpdate, admin_offices, actor=None):
        with self.lock:
            script = self._allowed_script(script_id, admin_offices)
            updated = script.model_copy(update={**payload.model_dump(by_alias=False),
                                               "updated_time": datetime.now(timezone.utc)})
            self.scripts[script_id] = updated
            return updated

    def remove_script_if_allowed(self, script_id, admin_offices):
        with self.lock:
            self._allowed_script(script_id, admin_offices)
            del self.scripts[script_id]


def create_demo():
    if settings.deployment_environment != "local":
        raise RuntimeError("The repository demo can only run in the local environment")
    settings.github_app_secret_id = ""
    settings.repository_mock_mode = False
    app = FastAPI(title="Local repository demo — no jobs are executed")
    database = DemoScripts()
    user = User(username="local-demo", offices=["SWT"], admin_offices=["SWT"],
                roles={"SWT": ["CWMS Users", "CWMS PD Users"]})
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_job_database] = lambda: database
    app.include_router(repository_files.router)
    app.include_router(scripts.router)
    app.include_router(users.router)

    @app.post("/_demo/scenario")
    def scenario(value: Literal["missing-credentials", "sample-files"]):
        settings.repository_mock_mode = value == "sample-files"
        return {"scenario": value, "instruction": "Reload the UI to refresh its cached catalog."}

    @app.get("/jobs")
    def jobs():
        return []

    @app.post("/jobs")
    def run_job():
        raise HTTPException(409, "This local demo does not execute jobs. It only previews script setup and repository browsing.")

    @app.get("/job-runners/default")
    def default_runner():
        return {"id": "00000000-0000-0000-0000-000000000001", "slug": "local-demo"}

    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(create_demo(), host="127.0.0.1", port=8000)
