"""Real cwms-cli HTTP upload against a loopback test receiver, not a CDA database."""
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from cwms_batch_events.core.execution import command_for_payload

requests = []
response_status = 200


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        requests.append((self.path, data))
        self.send_response(response_status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{}' if response_status == 200 else b'{"message":"Simulated upload failure"}')

    def log_message(self, *args):
        pass


def main():
    global response_status
    server = ThreadingHTTPServer(('127.0.0.1', 0), Receiver)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = {**os.environ, 'CDA_API_ROOT': f'http://127.0.0.1:{server.server_port}/',
           'CDA_API_KEY': 'local-test-only', 'DEMO_BLOB_ID': 'BATCH-CHAIN-LOCAL-TEST',
           'NO_COLOR': '1'}
    source = Path(__file__).with_name('example.sh').read_text()
    expected = b'CWMS Batch Events chained upload example\n'
    print(f'Real cwms-cli {version("cwms-cli")}, cwms-python {version("cwms-python")}; '
          'loopback HTTP test receiver (no CDA database)', flush=True)

    def run(command, runner):
        payload = SimpleNamespace(config_version=3, execution_type='command',
                                  command_mode='shell', repo_path='', shell_command=command)
        result = subprocess.run(command_for_payload(payload, runner=runner), env=env,
                                capture_output=True, text=True, timeout=60)
        print(result.stdout + result.stderr, end='', flush=True)
        return result

    try:
        for runner in ('batch', 'local'):
            requests.clear()
            result = run(source + '   ', runner)
            assert result.returncode == 0, result
            assert 'Generated file contents:\n' + expected.decode() in result.stdout
            assert len(requests) == 1, requests
            path, body = requests[0]
            assert urlsplit(path).path == '/blobs'
            assert parse_qs(urlsplit(path).query)['fail-if-exists'][0].lower() == 'true'
            assert body['office-id'] == 'SWT'
            assert body['id'] == env['DEMO_BLOB_ID']
            assert body['media-type-id'] == 'text/plain'
            assert base64.b64decode(body['value']) == expected
            print(f'PASS {runner}: create -> echo/cat -> real CLI POST; uploaded bytes match', flush=True)

            requests.clear()
            result = run(source.replace("'/tmp/job status.txt'", "'/missing-directory/job status.txt'"), runner)
            assert result.returncode != 0 and not requests
            assert 'Generated file contents:' not in result.stdout
            print(f'PASS {runner}: file creation failure skips echo and upload', flush=True)

            response_status = 500
            result = run(source.rstrip() + ' && echo SHOULD-NOT-RUN', runner)
            assert result.returncode != 0 and len(requests) == 1
            assert 'SHOULD-NOT-RUN' not in result.stdout
            print(f'PASS {runner}: HTTP upload failure fails the chain and skips following steps', flush=True)
            response_status = 200
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
