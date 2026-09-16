import json
import logging
import subprocess
import sys
import os
import socket
import time
from pathlib import Path
import httpx

from cwms_batch_events.api.routers.server_logs import parse_entry
from cwms_batch_events.core.logging_config import JsonFormatter


def test_formatter_keeps_exception_in_one_rich_event_without_payload():
    try:
        raise ValueError("password=do-not-log")
    except ValueError:
        record = logging.LogRecord("cwms_batch_events.test", logging.ERROR, __file__, 1,
                                   "Operation failed\nretry later", (), sys.exc_info())
    record.event = "test_failed"
    record.authorization = "Bearer do-not-log"
    line = JsonFormatter().format(record)
    assert len(line.splitlines()) == 1
    assert "do-not-log" not in line
    entry = parse_entry({"message": line, "eventId": "1", "timestamp": 1, "logStreamName": "s"})
    assert entry.level == "ERROR"
    assert entry.fields["error_type"] == "ValueError"
    assert entry.fields["event"] == "test_failed"
    assert entry.fields["stack"][0]["function"] == "test_formatter_keeps_exception_in_one_rich_event_without_payload"


def test_bootstrap_handles_existing_sinks_and_server_loggers_without_duplicates():
    script = '''
import logging
from cwms_batch_events.core.logging_config import configure_logging
from cwms_batch_events.core.settings import LoggingSettings, get_settings

settings = get_settings(LoggingSettings)
settings.log_level = "DEBUG"
logging.basicConfig()
for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "gunicorn.error", "gunicorn.access"):
    logging.getLogger(name).addHandler(logging.StreamHandler())
configure_logging(api=True)
configure_logging(api=True)
logging.getLogger("cwms_batch_events.probe").debug("application debug")
logging.getLogger("boto3").debug("SDK secret")
logging.getLogger("uvicorn.error").info("server startup")
logging.getLogger("gunicorn.error").error("worker error")
logging.getLogger("uvicorn.access").info("GET /?token=secret")
logging.getLogger("gunicorn.access").info("GET /?token=secret")
'''
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, check=True)
    records = [json.loads(line) for line in (result.stdout + result.stderr).splitlines()]
    assert [record["message"] for record in records] == ["application debug", "server startup", "worker error"]
    assert [record["level"] for record in records] == ["DEBUG", "INFO", "ERROR"]


def test_application_has_no_print_or_direct_stdout_calls():
    import ast
    root = Path(__file__).resolve().parents[3]
    files = list((root / "cwms_batch_events").rglob("*.py")) + [root / "infra/dispatcher/dispatcher_loop.py"]
    for path in files:
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call):
                assert not (isinstance(node.func, ast.Name) and node.func.id == "print"), str(path)
                assert ast.unparse(node.func) not in {"sys.stdout.write", "sys.stderr.write"}, str(path)


def test_real_uvicorn_emits_parseable_levels_without_raw_access_urls():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "cwms_batch_events.api.main:app", "--host", "127.0.0.1", "--port", str(port)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        env={**os.environ, "LOG_LEVEL": "DEBUG"},
    )
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=1) as client:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise AssertionError(process.communicate())
                try:
                    response = client.get("/health?token=secret-probe", headers={"Authorization": "Bearer secret-probe"})
                    break
                except (httpx.ConnectError, httpx.ConnectTimeout):
                    time.sleep(0.05)
            else:
                raise AssertionError("Uvicorn did not start")
            assert response.status_code == 200
            assert response.headers["x-request-id"]
            assert client.get("/secret-probe").status_code == 404
    finally:
        process.terminate()
        output, errors = process.communicate(timeout=10)
    assert "secret-probe" not in output + errors
    events = [json.loads(line) for line in (output + errors).splitlines() if line.strip()]
    assert any(e.get("event") == "api_initialized" and e["level"] == "INFO" for e in events)
    assert any(e.get("event") == "http_request" and e["level"] == "DEBUG" for e in events)
    assert any(e.get("route") == "<unmatched>" and e["level"] == "WARNING" for e in events)
    for index, event in enumerate(events):
        entry = parse_entry({"eventId": str(index), "message": json.dumps(event), "timestamp": 1, "logStreamName": "s"})
        assert entry.level != "UNKNOWN"
