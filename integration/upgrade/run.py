"""Test fresh installation and historical-data upgrades with isolated Docker DBs."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def command(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def check_api(port, database, historical):
    # Each database gets a fresh process so cached settings/engines cannot leak.
    env = os.environ | dict(PGHOST="127.0.0.1", PGPORT=port, PGDATABASE=database,
        PGUSER="eventsapp", PGPASSWORD="local-test-only", DATABASE_SCHEMA="events",
        DEFAULT_JOB_RUNNER="batch", AWS_DEFAULT_REGION="us-gov-west-1",
        APP_KEY="local-test-only", MOCK_USER="true", SCHEDULER_ENABLED="false",
        ALB_DNS_NAME="http://events", APP_SECRETS_ARN="unused")
    subprocess.run([sys.executable, str(Path(__file__).with_name("verify_api.py")),
                    "historical" if historical else "fresh"], env=env, check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(Path(__file__).with_name("verify_scheduler.py"))], env=env, check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(Path(__file__).with_name("verify_admin.py"))], env=env, check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(Path(__file__).with_name("verify_release_jars.py"))], env=env, check=True, cwd=ROOT)


def main():
    name = "events-upgrade-" + uuid4().hex[:10]
    image = name + ":migration"
    try:
        subprocess.run(["docker", "build", "-t", image, str(ROOT / "infra/migration")], check=True)
        command("docker", "run", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=local-test-only",
                "-p", "127.0.0.1::5432", "postgres:17")
        for _ in range(60):
            if subprocess.run(["docker", "exec", name, "pg_isready", "-U", "postgres"], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("PostgreSQL did not become ready")
        port = json.loads(command("docker", "inspect", name))[0]["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostPort"]
        for database in ("fresh", "upgrade", "current_upgrade"):
            command("docker", "exec", name, "createdb", "-U", "postgres", database)
            migrate = ["docker", "run", "--rm", "--network", f"container:{name}",
                "-e", f"FLYWAY_URL=jdbc:postgresql://127.0.0.1:5432/{database}",
                "-e", "FLYWAY_USER=postgres", "-e", "FLYWAY_PASSWORD=local-test-only",
                "-e", "FLYWAY_DEFAULT_SCHEMA=events", "-e", "FLYWAY_PLACEHOLDERS_APP_USER=eventsapp",
                "-e", "FLYWAY_PLACEHOLDERS_APP_PASSWORD=local-test-only", image]
            if database != "fresh":
                subprocess.run(migrate + ["-target=1.01.03", "migrate"], check=True)
                subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-d", database,
                                "-v", "ON_ERROR_STOP=1"], input=Path(__file__).with_name("legacy.sql").read_text(), text=True, check=True)
                if database == "current_upgrade":
                    # Existing deployments have already applied config versions.
                    subprocess.run(migrate + ["-target=1.01.15", "migrate"], check=True)
            subprocess.run(migrate + ["migrate"], check=True)
            check_api(port, database, database != "fresh")
        print("PASS: fresh installation and upgrades from schemas 1.01.03 and 1.01.15")
        subprocess.run([sys.executable, str(Path(__file__).with_name("verify_execution.py"))], check=True)
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        subprocess.run(["docker", "image", "rm", image], capture_output=True)


if __name__ == "__main__":
    main()
