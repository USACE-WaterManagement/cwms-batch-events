"""Independent wall-clock/output watchdog for the untrusted PDF parser.

The API event loop cannot delay this deadline while serving other requests.
No document bytes or diagnostics are written to disk or emitted on failure.
"""

import ctypes
import os
import resource
import selectors
import signal
import subprocess
import sys
import time

prctl = ctypes.CDLL(None).prctl


def prepare_child(parent):
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if prctl(1, signal.SIGKILL) != 0 or os.getppid() != parent:
        os._exit(1)


def main():
    prepare_child(int(sys.argv[1]))
    worker_pid = os.getpid()
    process = subprocess.Popen(
        [
            "java",
            "-Xmx256m",
            "-XX:-UsePerfData",
            "-XX:-HeapDumpOnOutOfMemoryError",
            "-XX:ErrorFile=/dev/null",
            "-Djava.security.manager=allow",
            "-cp",
            sys.argv[2],
            "DocumentScanner",
            sys.argv[3],
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        preexec_fn=lambda: prepare_child(worker_pid),
    )
    output = bytearray()
    deadline = time.monotonic() + 120
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not selector.select(remaining):
                    return 1
                chunk = os.read(process.stdout.fileno(), 8192)
                if not chunk:
                    break
                output.extend(chunk)
                if len(output) > 256 * 1024:
                    return 1
        if process.wait(timeout=max(0.01, deadline - time.monotonic())):
            return 1
        sys.stdout.buffer.write(output)
        return 0
    except Exception:
        return 1
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()


if __name__ == "__main__":
    sys.exit(main())
