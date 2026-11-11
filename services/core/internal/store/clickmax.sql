-- Explicit card bindings for the internal SDR. A phone or a contact can have
-- multiple ClickMax opportunities, so the card ID is unique and mandatory.
CREATE TABLE IF NOT EXISTS bia_go.clickmax_cards (
    lead_id text PRIMARY KEY REFERENCES bia_go.leads(id) ON DELETE CASCADE,
    card_id uuid NOT NULL UNIQUE,
    pipeline_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    confirmed_stage uuid NOT NULL,
    attempted_stage uuid,
    paused boolean NOT NULL DEFAULT false,
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    error_code text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bia_go.schema_versions(version) VALUES(23) ON CONFLICT DO NOTHING;
