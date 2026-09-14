# Local validation

The revised implementation moves scanning into a separate SWT runner container.
The API image was rebuilt and verified to have no `java` executable. No production
resources or CDK were changed.

- 214 backend unit tests pass, including existing SWT job-definition routing and
  scan-specific dispatcher binding, private bucket checks, bounded uploads and summaries.
- Real local Keycloak/CDA accounts verify SWT access, owner isolation, no-store,
  admission and size/type rejection through /document/scan.
- Moto emulates SQS and private S3 staging. Actual district runner containers use
  the inherited command-capable entrypoint, 1 CPU / 1 GiB, and a 256 MiB Java heap.
  Upload and approved W3C URL scans complete; sources and manifests are deleted,
  duplicate delivery is harmless, reports are imported, and staging becomes empty.
- The synthetic 2,072-byte PDF returns seven failed rules across 27 checks. The
  W3C dummy PDF returns eight failed rules across 18 checks. Summary priorities
  identify tagging, language, metadata/title display and embedded fonts.
- Storage lifecycle tests verify expired reports are hidden/deleted, deletion
  failures retain cleanup responsibility, retries remove staging, and malformed
  runner results fail closed.
- Four web tests pass after updating the upload-storage and queue-status copy.

The runner's separate repository contains URL validation and real-container success,
failure, deletion and duplicate-delivery tests. The CI base is a public test fixture;
local end-to-end tests also exercise a built CWBI command-capable runner base.

This does not validate live AWS IAM, S3 access policy enforcement, Batch scheduling,
Fargate capacity, CAC federation, production image rollout, or proxy buffering.
S3 lifecycle deletion is asynchronous. Java 21 SecurityManager enforcement remains
a pilot dependency that must be replaced before upgrading to a runtime without it.
