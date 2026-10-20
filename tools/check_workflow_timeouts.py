"""Require every GitHub Actions job to have the repository runtime cap."""

from pathlib import Path
import re
import sys


WORKFLOW_DIR = Path(".github/workflows")
JOB_PATTERN = re.compile(r"^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$")


def check_workflow(path: Path) -> list[str]:
    errors: list[str] = []
    in_jobs = False
    job_name: str | None = None
    job_lines: list[str] = []

    def finish_job() -> None:
        if job_name is None:
            return
        has_runner = any(re.match(r"^    (runs-on|uses):", line) for line in job_lines)
        if not has_runner:
            return
        timeout = next(
            (line.split(":", 1)[1].strip() for line in job_lines if line.startswith("    timeout-minutes:")),
            None,
        )
        if timeout != "15":
            errors.append(
                f"{path}: job '{job_name}' must set timeout-minutes: 15"
            )

    for line in path.read_text(encoding="utf-8").splitlines():
        if line == "jobs:":
            in_jobs = True
            continue
        if in_jobs and line and not line.startswith(" "):
            finish_job()
            in_jobs = False
            job_name = None
            job_lines = []
            continue
        if not in_jobs:
            continue
        match = JOB_PATTERN.match(line)
        if match:
            finish_job()
            job_name = match.group(1)
            job_lines = []
            continue
        if job_name is not None:
            job_lines.append(line)

    finish_job()
    return errors


def main() -> int:
    errors = [
        error
        for path in sorted(WORKFLOW_DIR.glob("*.yml"))
        for error in check_workflow(path)
    ]
    if errors:
        print("\n".join(errors))
        return 1
    print("All GitHub Actions jobs set timeout-minutes: 15")
    return 0


if __name__ == "__main__":
    sys.exit(main())
