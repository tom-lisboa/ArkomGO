CREATE TABLE IF NOT EXISTS gif_keys (
    account_id uuid PRIMARY KEY REFERENCES customer_accounts(id),
    encrypted_key bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS gif_grants (
    account_id uuid PRIMARY KEY REFERENCES customer_accounts(id),
    expires_at timestamptz NOT NULL,
    remaining integer NOT NULL CHECK (remaining >= 0)
);
CREATE TABLE IF NOT EXISTS gif_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES customer_accounts(id),
    prompt text NOT NULL,
    sponsored boolean NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    image bytea
);
CREATE UNIQUE INDEX IF NOT EXISTS gif_one_active_per_account
    ON gif_jobs(account_id) WHERE status IN ('queued','running');
