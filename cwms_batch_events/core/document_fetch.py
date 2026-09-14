"""Isolated, cancellable URL fetch; URL is stdin, PDF is an inherited memfd."""

import sys
import signal
from fastapi import HTTPException

from cwms_batch_events.api.routers.document_scan import child_setup, fetch_pdf

if __name__ == "__main__":
    child_setup(int(sys.argv[2]))
    signal.alarm(30)
    try:
        fetch_pdf(sys.stdin.buffer.read(4096).decode("utf-8"), int(sys.argv[1]))
    except HTTPException as error:
        sys.exit(13 if error.status_code == 413 else 1)
    except Exception:
        sys.exit(1)
