"""Run the memory-only compatibility gate using synthetic documents exclusively.

Usage: python integration/document_scans/run_gate.py /absolute/evidence/directory
Both runs enforce the scanner's no-write policy.
"""

import json
from pathlib import Path
import subprocess
import sys
from generate_sample import sample_pdf


def main():
    source = Path(__file__).resolve().parent
    evidence = Path(sys.argv[1]).resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    image = "document-scan-api:local"
    subprocess.run(
        [
            "docker",
            "build",
            "-t",
            image,
            str(source.parent.parent),
        ],
        check=True,
    )
    results = {}
    document = sample_pdf()
    (evidence / "sample-accessibility.pdf").write_bytes(document)
    from reportlab import __file__ as reportlab_path

    embedded = sample_pdf(Path(reportlab_path).parent / "fonts" / "Vera.ttf")
    for name, readonly, data in [
        ("readonly-adapter", True, document),
        ("writable-root-adapter", False, document),
        ("embedded-font-readonly", True, embedded),
    ]:
        command = [
            "docker",
            "run",
            "--rm",
            "-i",
            "--network",
            "none",
            "--cpus",
            "0.5",
            "--memory",
            "1g",
            "--memory-swap",
            "1g",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "-e",
            "PYTHONDONTWRITEBYTECODE=1",
            "-v",
            f"{source}:/probe:ro",
        ]
        if readonly:
            command.append("--read-only")
        command += [image, "python", "/probe/probe.py"]
        completed = subprocess.run(
            command, input=data, capture_output=True, timeout=150
        )
        (evidence / f"{name}.stdout.txt").write_bytes(completed.stdout)
        (evidence / f"{name}.stderr.txt").write_bytes(completed.stderr)
        results[name] = {
            "exit_code": completed.returncode,
            "scan_completed": completed.returncode == 0,
        }
    results["gate_passed"] = all(item["scan_completed"] for item in results.values())
    (evidence / "gate-results.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )
    print(json.dumps(results, indent=2))
    return 0 if results["gate_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
