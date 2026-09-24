# Create, print, and upload a text file

Paste [example.sh](example.sh) into Scripts Manager's **Bash command** editor,
using **Installed command** as the source. Supply `CDA_API_ROOT`, `CDA_API_KEY`,
and a unique `DEMO_BLOB_ID` through the job environment. The example uses office
`SWT`; change it for your target office. No credentials belong in the command.

The `&&` chain creates a text file, echoes a heading, prints the contents with
`cat`, and calls `cwms-cli blob upload`. It does not overwrite existing blobs.

## Reproduce the local test

Run from the repository root in PowerShell (Docker Desktop Linux containers):

```powershell
docker run --rm --mount "type=bind,source=$PWD,target=/workspace,readonly" -w /workspace python:3.13-slim bash -c 'pip install --quiet cwms-cli==0.9.1 cwms-python==1.0.10 packaging==25.0 pydantic && python integration/cwms_cli/verify.py'
```

This runs real Bash and the published cwms-cli executable. It uses the application's
v3 command builder for both AWS Batch and local Docker, then sends a real HTTP
POST to a loopback test receiver. The receiver checks the office, blob ID,
media type, create-only flag, and exact decoded file bytes.

It also verifies that file creation failure skips the remaining steps and that
an HTTP upload failure returns a nonzero exit status and skips a later command.
The quoted filename contains spaces, and the success case includes trailing whitespace.

This is not a live AWS job or CDA database persistence test. The receiver uses
a dummy local API key and cannot verify CDA authorization, storage, or retrieval.

Both Python packages are explicitly installed: cwms-cli 0.9.1 does not install
cwms-python automatically. Install `packaging` too, as the runner image does.
Without a version parser, cwms-cli 0.9.1 falls back to string comparison and
incorrectly rejects 1.0.10 as older than 1.0.7. The latest pair passes this test
with `packaging` installed; a cwms-python downgrade is not needed.
