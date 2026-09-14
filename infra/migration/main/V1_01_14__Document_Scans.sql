CREATE TABLE document_scans (
    id UUID PRIMARY KEY,
    owner VARCHAR(256) NOT NULL,
    office VARCHAR(3) NOT NULL CHECK (office = 'SWT'),
    status VARCHAR(16) NOT NULL CHECK (status IN ('receiving', 'running', 'completed', 'failed')),
    sha256 VARCHAR(64),
    size_bytes INTEGER CHECK (size_bytes BETWEEN 1 AND 10485760),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '5 minutes',
    expires_at TIMESTAMPTZ,
    result JSONB,
    error VARCHAR(256)
);
-- Admission covers receiving, fetching, and scanning across all API workers.
CREATE UNIQUE INDEX document_scans_one_active ON document_scans ((true))
    WHERE status IN ('receiving', 'running');
CREATE INDEX document_scans_owner_created ON document_scans (owner, created_at DESC);
CREATE INDEX document_scans_expiry ON document_scans (expires_at);
