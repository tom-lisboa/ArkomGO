CREATE TABLE IF NOT EXISTS jobs (
    id text PRIMARY KEY,
    idempotency_key text NOT NULL UNIQUE,
    fixture text NOT NULL CHECK (fixture IN ('entrevista-demo', 'retry-demo', 'falha-demo')),
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_until timestamptz,
    result jsonb,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'running') = (lease_until IS NOT NULL)),
    CHECK ((status = 'succeeded') = (result IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS jobs_ready ON jobs (available_at, created_at, id)
    WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS jobs_expired ON jobs (lease_until)
    WHERE status = 'running';

CREATE TABLE IF NOT EXISTS job_videos (
    job_id text PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
    mp4 bytea NOT NULL CHECK (octet_length(mp4) BETWEEN 12 AND 10485760)
);
