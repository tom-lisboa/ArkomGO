CREATE TABLE IF NOT EXISTS customer_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_project text NOT NULL,
    source_user_id uuid NOT NULL,
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_project, source_user_id)
);
CREATE TABLE IF NOT EXISTS customer_workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL UNIQUE REFERENCES customer_accounts(id),
    source_org_id uuid NOT NULL,
    source_instance_id uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_sessions (
    token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
    account_id uuid NOT NULL REFERENCES customer_accounts(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at);
