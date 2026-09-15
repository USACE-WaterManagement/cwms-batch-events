"""Execute harmless historical path fixtures in an isolated Linux container."""
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from docker.utils import split_command

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from cwms_batch_events.core.execution import command_for_payload


def main():
    cases = []
    for runner in ("batch", "local"):
        paths = ["python/run_hourly.py", "/python/run_hourly.py", "./python/run_hourly.py",
                 "python/../report.py", "../report.py", "/jobs/python/report.py"]
        paths += ["python/two words.py"] if runner == "batch" else [
            'python/"two words.py"', 'python/run_hourly.py --office "two words"']
        for path in paths:
            historical = ["python", f"/jobs/{path}"] if runner == "batch" else split_command(f"python /jobs/{path}")
            current = command_for_payload(SimpleNamespace(config_version=1, repo_path=path), runner=runner)
            current = split_command(current) if isinstance(current, str) else current
            assert current == historical
            cases.append((historical, current))
    # Fixtures and processes exist only in this disposable container. No office
    # repositories, production images, credentials, or host mounts are involved.
    code = '''
from pathlib import Path
import subprocess

for name in ("/jobs/python/run_hourly.py", "/jobs/report.py", "/report.py",
             "/jobs/jobs/python/report.py", "/jobs/python/two words.py"):
    path = Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("import sys; print('legacy-ok', repr(sys.argv[1:]))")
for historical, current in CASES:
    before = subprocess.run(historical, capture_output=True, text=True, check=True)
    after = subprocess.run(current, capture_output=True, text=True, check=True)
    assert before.stdout == after.stdout and before.stdout.startswith("legacy-ok"), (historical, current)
print(f"PASS: {len(CASES)} historical command executions match v1")
'''.replace("CASES", repr(cases))
    subprocess.run(["docker", "run", "--rm", "--network=none", "-i", "python:3.13-slim", "python", "-"],
                   input=code, text=True, check=True)


if __name__ == "__main__":
    main()
