import hashlib
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import sys
from threading import Thread
from types import SimpleNamespace

import pytest
from cwms_batch_events.core.models import ReleaseJar
from cwms_batch_events.core.release_jars import jar_command


@pytest.mark.skipif(os.name == 'nt' or not shutil.which('javac') or not shutil.which('jar'), reason='POSIX runner and JDK required for exec integration')
def test_downloaded_jar_runs_with_arguments_and_exit_status(tmp_path):
    source = tmp_path / 'Main.java'
    source.write_text('public class Main { public static void main(String[] args) { System.out.println("JAR-RAN:" + String.join("|", args)); System.exit(7); } }', encoding='utf-8')
    subprocess.run(['javac', str(source)], check=True, timeout=30)
    subprocess.run(['jar', '--create', '--file', str(tmp_path / 'job.jar'), '--main-class', 'Main', '-C', str(tmp_path), 'Main.class'], check=True, timeout=30)
    data = (tmp_path / 'job.jar').read_bytes()
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            assert self.headers.get('X-Artifact-Ticket')
            self.send_response(200)
            self.end_headers()
            self.wfile.write(data)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        pin = ReleaseJar(repository='org/repo', release_id=1, asset_id=1, tag='v1', name='job.jar', sha256=hashlib.sha256(data).hexdigest(), size=len(data))
        message = SimpleNamespace(job_id='test', payload=SimpleNamespace(release_jar=pin, command_args=['two words', '$literal']))
        command = jar_command(message, f'http://127.0.0.1:{server.server_port}', 'key')
        command[0] = sys.executable
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        assert result.returncode == 7, result.stderr
        assert result.stdout.strip() == 'JAR-RAN:two words|$literal'
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
