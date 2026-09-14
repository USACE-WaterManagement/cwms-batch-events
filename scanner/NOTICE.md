# Scanner dependencies

veraPDF Greenfield 1.30.2 is distributed under the Mozilla Public License 2.0
(the alternative GPL license is not selected here). The unmodified upstream
library and parser source is available at https://github.com/veraPDF/veraPDF-library
and https://github.com/veraPDF/veraPDF-parser . Release sources and tags are
available through those repositories. The installer checksum is pinned in the
API Dockerfile. Bundled dependency license notices are retained in the extracted
classpath, including META-INF and org/xmlresolver/notices.

DocumentScanner.java is this application's adapter. Upstream libraries are not
patched. Static resources are unpacked at build time to avoid runtime temporary
resource files. Runtime Java is pinned to major version 21 because the adapter
uses its SecurityManager to fail closed on filesystem writes and networking.
Do not upgrade to a Java release that removes that facility without replacing
the enforcement and rerunning the memory-only gate.
