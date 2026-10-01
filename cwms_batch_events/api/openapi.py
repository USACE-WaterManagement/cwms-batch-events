from collections.abc import MutableMapping

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


RATE_LIMIT_RESPONSE = {
    "description": "The authenticated credential exceeded the request or job-submission limit.",
    "headers": {
        "Retry-After": {"description": "Seconds to wait before retrying.", "schema": {"type": "integer", "minimum": 1}},
        "X-RateLimit-Limit": {"description": "Configured requests allowed in the current 60-second window.", "schema": {"type": "integer", "minimum": 1}},
        "X-RateLimit-Remaining": {"description": "Requests remaining in the current 60-second window.", "schema": {"type": "integer", "minimum": 0}},
    },
    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/RateLimitExceededResponse"}, "example": {"detail": {"code": "rate_limit_exceeded", "message": "Request limit exceeded for /jobs", "requestUrl": "/jobs", "documentationUrl": "/events/about/rate-limits", "limit": 10, "windowSeconds": 60, "retryAfterSeconds": 24}}}},
}

RATE_LIMIT_SCHEMA = {
    "type": "object",
    "required": ["detail"],
    "properties": {"detail": {"type": "object", "required": ["code", "message", "requestUrl", "documentationUrl", "limit", "windowSeconds", "retryAfterSeconds"], "properties": {"code": {"type": "string", "example": "rate_limit_exceeded"}, "message": {"type": "string"}, "requestUrl": {"type": "string"}, "documentationUrl": {"type": "string"}, "limit": {"type": "integer", "minimum": 1}, "windowSeconds": {"type": "integer", "const": 60}, "retryAfterSeconds": {"type": "integer", "minimum": 1}}}},
}


def is_rate_limit_exempt_path(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return normalized.endswith(("/health", "/docs", "/redoc", "/openapi.json")) or "/internal" in normalized


def configure_rate_limit_openapi(app: FastAPI) -> None:
    def custom_openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, openapi_version=app.openapi_version,
            summary=app.summary, description=app.description, terms_of_service=app.terms_of_service,
            contact=app.contact, license_info=app.license_info, routes=app.routes,
            webhooks=app.webhooks.routes, tags=app.openapi_tags, servers=app.servers)
        schemas: MutableMapping = schema.setdefault("components", {}).setdefault("schemas", {})
        schemas["RateLimitExceededResponse"] = RATE_LIMIT_SCHEMA
        for path, path_item in schema.get("paths", {}).items():
            if is_rate_limit_exempt_path(path):
                continue
            for operation in path_item.values():
                if isinstance(operation, dict) and "responses" in operation:
                    operation["responses"]["429"] = RATE_LIMIT_RESPONSE
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi
