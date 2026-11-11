CREATE SCHEMA IF NOT EXISTS arkom_crm;

CREATE TABLE IF NOT EXISTS arkom_crm.routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES platform_directory.organizations(id),
    bia_installation_id uuid NOT NULL UNIQUE REFERENCES platform_directory.installations(id),
    publisher_id uuid NOT NULL REFERENCES integration_clients(id),
    crm_reference text NOT NULL CHECK (btrim(crm_reference) <> ''),
    workspace_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    key_env text NOT NULL CHECK (key_env ~ '^ARKOM_CRM_CLICKMAX_[A-Z0-9_]+$'),
    enabled boolean NOT NULL DEFAULT false
);

ALTER TABLE arkom_crm.routes ADD COLUMN IF NOT EXISTS workspace_slug text
    CHECK (workspace_slug ~ '^[a-z0-9][a-z0-9-]{0,99}$');

CREATE TABLE IF NOT EXISTS arkom_crm.deliveries (
    route_id uuid NOT NULL REFERENCES arkom_crm.routes(id),
    opportunity_id text NOT NULL,
    clickmax_lead_id uuid NOT NULL,
    title text NOT NULL,
    state text NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending','creating','done','rejected','review')),
    clickmax_card_id uuid,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (route_id, opportunity_id),
    CHECK ((state = 'done') = (clickmax_card_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS crm_deliveries_pending ON arkom_crm.deliveries(next_attempt_at)
    WHERE state = 'pending';
