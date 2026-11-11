ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'supabase'
    CHECK (auth_provider IN ('supabase','local'));
ALTER TABLE customer_workspaces ALTER COLUMN source_org_id DROP NOT NULL;
ALTER TABLE customer_workspaces ALTER COLUMN source_instance_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS platform_organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_access (
    account_id uuid NOT NULL REFERENCES customer_accounts(id),
    organization_id uuid NOT NULL REFERENCES platform_organizations(id),
    solution text NOT NULL,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','operator','admin')),
    enabled boolean NOT NULL DEFAULT true,
    PRIMARY KEY(account_id,organization_id,solution)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_access_single_home ON platform_access(account_id,solution);
CREATE TABLE IF NOT EXISTS native_credentials (
    account_id uuid PRIMARY KEY REFERENCES customer_accounts(id),
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_login_limits (
    id text PRIMARY KEY,
    attempts integer NOT NULL,
    reset_at timestamptz NOT NULL
);

-- Stable existing workspace IDs become the organization mapping. This does not
-- reassign any original account, project, or Supabase membership.
INSERT INTO platform_organizations(id,slug,name)
SELECT w.id,'clips-'||w.id::text,'CLIPS homologação' FROM customer_workspaces w
JOIN customer_accounts a ON a.id=w.account_id WHERE a.auth_provider='supabase' ON CONFLICT(id) DO NOTHING;
INSERT INTO platform_access(account_id,organization_id,solution)
SELECT w.account_id,w.id,'clips' FROM customer_workspaces w JOIN customer_accounts a ON a.id=w.account_id
WHERE a.auth_provider='supabase' ON CONFLICT DO NOTHING;
