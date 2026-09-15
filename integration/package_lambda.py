"""Build the same self-contained application bundle for both Lambda entry points."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
FUNCTIONS = {"dispatcher": ("dispatch_job", "dispatcher.py"),
             "status-updater": ("update_batch_job_status", "status_updater.py")}


def package_lambda(function: str, output: Path, environment: str, revision: str) -> Path:
    if output.exists() and any(output.iterdir()):
        raise ValueError("Lambda build output must be empty")
    output.mkdir(parents=True, exist_ok=True)
    module, entry = FUNCTIONS[function]
    source = ROOT / "cwms_batch_events"
    subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
                    "--no-compile", "-r", str(source / "lambdas" / module / "requirements.txt"),
                    "--target", str(output)], check=True)
    shutil.copytree(source, output / "cwms_batch_events", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copy2(source / "lambdas" / module / entry, output / entry)
    (output / "cwms_batch_events" / "build-info.json").write_text(
        json.dumps({"environment": environment, "version": revision}), encoding="utf-8")
    archive = output.with_suffix(".zip")
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        for path in sorted(output.rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(output).as_posix())
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--function", choices=FUNCTIONS, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--environment", required=True)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    package_lambda(args.function, args.output, args.environment, args.revision)
