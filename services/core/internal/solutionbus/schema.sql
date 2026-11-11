CREATE TABLE IF NOT EXISTS integration_clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    solution text NOT NULL CHECK(solution IN ('clips','social','finance','bia-sdr')),
    token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_grants (
    client_id uuid NOT NULL REFERENCES integration_clients(id),
    organization_id uuid NOT NULL REFERENCES platform_organizations(id),
    source_solution text NOT NULL,
    can_read boolean NOT NULL DEFAULT false,
    can_publish boolean NOT NULL DEFAULT false,
    can_artifacts boolean NOT NULL DEFAULT false,
    PRIMARY KEY(client_id,organization_id,source_solution)
);
CREATE TABLE IF NOT EXISTS integration_outbox (
    id text PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES platform_organizations(id),
    source_solution text NOT NULL,
    event_type text NOT NULL,
    subject text NOT NULL,
    envelope jsonb NOT NULL,
    content_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_outbox_scope ON integration_outbox(organization_id,source_solution,created_at,id);
CREATE TABLE IF NOT EXISTS integration_acks (
    client_id uuid NOT NULL REFERENCES integration_clients(id),
    event_id text NOT NULL REFERENCES integration_outbox(id),
    receipt_id text NOT NULL,
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(client_id,event_id)
);
