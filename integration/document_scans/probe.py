"""Real scanner compatibility gate. Input exists only in an anonymous memfd."""

import hashlib
import json
import os
import subprocess
import sys
import time

data = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
fd = os.memfd_create("document-scan", os.MFD_CLOEXEC)
try:
    os.write(fd, data)
    os.lseek(fd, 0, os.SEEK_SET)
    path = f"/proc/{os.getpid()}/fd/{fd}"
    started = time.monotonic()
    result = subprocess.run(
        [
            "java",
            "-Xmx256m",
            "-XX:-UsePerfData",
            "-XX:-HeapDumpOnOutOfMemoryError",
            "-XX:ErrorFile=/dev/null",
            "-Djava.security.manager=allow",
            "-cp",
            "/opt/scanner/classes",
            "DocumentScanner",
            path,
        ],
        capture_output=True,
        timeout=120,
    )
    print(
        json.dumps(
            {
                "returncode": result.returncode,
                "seconds": time.monotonic() - started,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    )
    print(result.stdout.decode())
    print(result.stderr.decode(), file=sys.stderr)
    # Findings are a successful scan, not an execution failure.
    try:
        report = json.loads(result.stdout)
        completed = result.returncode == 0 and report["end_status"] == "normal"
    except (ValueError, KeyError, TypeError):
        completed = False
finally:
    os.close(fd)
sys.exit(0 if completed else 2)
