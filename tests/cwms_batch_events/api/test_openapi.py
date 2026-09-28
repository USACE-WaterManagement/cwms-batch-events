from cwms_batch_events.api.main import app
from cwms_batch_events.api.openapi import is_rate_limit_exempt_path


def test_openapi_documents_rate_limit_response_on_non_exempt_operations():
    app.openapi_schema = None
    schema = app.openapi()

    assert "429" in schema["paths"]["/jobs"]["post"]["responses"]
    response = schema["paths"]["/jobs"]["post"]["responses"]["429"]
    assert response["headers"]["Retry-After"]["schema"]["type"] == "integer"
    assert response["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/RateLimitExceededResponse"}
    assert "RateLimitExceededResponse" in schema["components"]["schemas"]

    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if method in {"get", "post", "put", "patch", "delete", "options", "head", "trace"}:
                assert ("429" in operation["responses"]) is (not is_rate_limit_exempt_path(path))
