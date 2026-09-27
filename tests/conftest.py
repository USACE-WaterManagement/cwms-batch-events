import os
import sys
os.environ.setdefault("SCHEDULER_ENABLED", "false")
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("ALB_DNS_NAME", "http://events")
os.environ.setdefault("APP_SECRETS_ARN", "arn:aws:secretsmanager:test")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-gov-west-1")
os.environ.setdefault("APP_KEY", "test")
os.environ.setdefault("AUTH_ENVIRONMENT", "TEST")
os.environ.setdefault("CDA_API_ROOT", "http://localhost")
os.environ.setdefault("PGUSER", "test")
os.environ.setdefault("PGPASSWORD", "test")
os.environ.setdefault("PGDATABASE", "test")
os.environ.setdefault("PGHOST", "localhost")
