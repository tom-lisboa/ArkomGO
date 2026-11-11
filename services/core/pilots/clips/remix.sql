CREATE TABLE IF NOT EXISTS remix_authorizations (
 request_hash text PRIMARY KEY, installation_id uuid NOT NULL REFERENCES platform_directory.installations(id),
 state text NOT NULL, challenge text NOT NULL, expires_at timestamptz NOT NULL,
 completed_at timestamptz, code_hash text UNIQUE, account_id uuid REFERENCES customer_accounts(id),
 parent_session_hash text, code_expires_at timestamptz, consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS remix_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES platform_directory.installations(id),
 account_id uuid NOT NULL REFERENCES customer_accounts(id), parent_session_hash text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS remix_access_tokens (
 hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES remix_sessions(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS remix_refresh_tokens (
 hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES remix_sessions(id), consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS remix_limits (
 id text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS remix_tokens_session ON remix_access_tokens(session_id);
CREATE INDEX IF NOT EXISTS remix_refresh_session ON remix_refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS remix_sessions_account ON remix_sessions(account_id,installation_id);
