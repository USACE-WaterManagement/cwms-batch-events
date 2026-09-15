"""Build and import the deployment artifacts, including their bundled dependencies."""
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from package_lambda import FUNCTIONS, package_lambda


def main():
    env = os.environ | {
        "AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test",
        "AWS_DEFAULT_REGION": "us-east-1", "AWS_EC2_METADATA_DISABLED": "true",
        "ALB_DNS_NAME": "http://events", "APP_SECRETS_ARN": "test",
    }
    with TemporaryDirectory(prefix="lambda-packages-") as directory:
        for function, (_, entry) in FUNCTIONS.items():
            output = Path(directory) / function
            package_lambda(function, output, "test", "test-revision")
            # -I prevents the checkout and user site from satisfying imports.
            code = '''
import importlib, json, pathlib, sys
bundle = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(bundle))
for name in ("aws_lambda_powertools", "pydantic_settings", "requests"):
    module = importlib.import_module(name)
    assert pathlib.Path(module.__file__).resolve().is_relative_to(bundle), name
handler = importlib.import_module(sys.argv[2]).lambda_handler
assert callable(handler)
from cwms_batch_events.core.logging_config import build_metadata
assert build_metadata() == {"environment": "test", "version": "test-revision"}
'''
            subprocess.run([sys.executable, "-I", "-c", code, str(output), Path(entry).stem],
                           env=env, check=True)


if __name__ == "__main__":
    main()
