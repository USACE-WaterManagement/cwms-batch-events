# Local validation

Validated on 2026-09-14 with Docker Desktop Linux containers. The API used two
Gunicorn workers at the reviewed task limits: 0.5 CPU and 1 GiB, with no swap.

- All 224 Python tests passed with networking disabled after rebasing onto the
  current cwbi-dev branch.
- The production Docker image built successfully. The compatibility harness
  passed on read-only and writable container roots, including an embedded-font
  PDF under the scanner's write-denying policy.
- Real Keycloak JWTs and CDA profiles verified anonymous and non-SWT rejection,
  cross-user list/detail isolation, global admission, successful scanning,
  empty/invalid/oversized upload rejection, unsafe URL rejection, and no-store
  headers, including unauthenticated responses.
- PostgreSQL lifecycle checks verified expired reports are hidden and removed,
  interrupted admission is recovered, malformed PDFs fail, and cancellation and
  timeout close the input descriptor and terminate scanner children.
- Browser PKCE login, upload, approved W3C HTTPS URL scanning, result summaries,
  logout clearing, and desktop/mobile layout were exercised with the separate
  SWT app. Scan content was absent from browser local/session storage.
- Both newly added workflow files passed actionlint. The existing API build
  workflow retains pre-existing ShellCheck quoting warnings in unchanged steps.

The generated 2,072-byte untagged PDF returned seven failed rules across 27 failed
checks in about four seconds. Its SHA-256 was
`dde1662c021082e69e4ada3068257c84f54bd6fa47a722fb8d5cb3c0e3223226`.
Summary priorities were tags/reading order, language, metadata/title display,
and embedded fonts. The public W3C dummy PDF returned eight failed rules across
18 checks. Neither result is a Section 508 certification.

Evidence files and browser screenshots were kept outside the source tree.
No AWS deployment, production throughput, CAC federation, external proxy/WAF
behavior, or disaster-recovery deletion was tested. Java 21's deprecated
SecurityManager remains a deliberate pilot dependency; replace that enforcement
before changing the Java runtime family.
