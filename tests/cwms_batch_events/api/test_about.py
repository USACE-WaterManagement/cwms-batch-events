from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

from cwms_batch_events.api.dependencies import get_current_user
from cwms_batch_events.api.main import app


def test_application_info_returns_deployment_and_user_details(client, user):
    response = client.get("/about/application")

    assert response.status_code == 200
    assert response.json() == {
        "name": "CWMS Batch Events",
        "apiVersion": "local",
        "environment": "local",
        "buildRevision": "local",
        "buildTime": None,
        "authenticationEnvironment": "local mock",
        "jobRunner": "batch",
        "rootPath": "/",
        "user": {
            "username": user.username,
            "offices": user.offices,
            "adminOffices": user.admin_offices,
            "roles": user.roles,
        },
    }


def test_schema_info_returns_latest_applied_migration(client, db_session):
    installed_on = datetime(2026, 8, 26, 12, 30, tzinfo=timezone.utc)
    db_session.execute.return_value.mappings.return_value.one_or_none.return_value = {
        "version": "1.01.03",
        "description": "Extend Jobs Table",
        "installed_on": installed_on,
    }

    response = client.get("/about/schema")

    assert response.status_code == 200
    assert response.json() == {
        "name": "events",
        "version": "1.01.03",
        "description": "Extend Jobs Table",
        "installedOn": "2026-08-26T12:30:00Z",
    }


def test_schema_info_reports_unavailable_database(client, db_session):
    db_session.execute.side_effect = SQLAlchemyError("database unavailable")

    response = client.get("/about/schema")

    assert response.status_code == 503
    assert response.json() == {"detail": "Schema version is currently unavailable"}


def test_schema_info_reports_missing_migration(client, db_session):
    db_session.execute.return_value.mappings.return_value.one_or_none.return_value = None

    response = client.get("/about/schema")

    assert response.status_code == 503
    assert response.json() == {"detail": "No applied schema version was found"}


def test_about_endpoints_require_authentication(client):
    def unauthenticated():
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    app.dependency_overrides[get_current_user] = unauthenticated

    assert client.get("/about/application").status_code == 401
    assert client.get("/about/schema").status_code == 401
