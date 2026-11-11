CREATE TABLE IF NOT EXISTS app_projects (
    job_id text PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES customer_accounts(id),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_projects_owner ON app_projects(account_id,created_at DESC);
