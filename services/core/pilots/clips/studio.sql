CREATE TABLE IF NOT EXISTS studio_inputs (
    job_id text PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    owner text NOT NULL,
    fingerprint text NOT NULL,
    source bytea NOT NULL CHECK (octet_length(source) BETWEEN 12 AND 50331648),
    captions bytea,
    start_seconds double precision NOT NULL CHECK (start_seconds BETWEEN 0 AND 3600),
    duration_seconds double precision NOT NULL CHECK (duration_seconds BETWEEN 1 AND 30)
);
