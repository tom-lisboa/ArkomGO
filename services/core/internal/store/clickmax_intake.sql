CREATE TABLE IF NOT EXISTS bia_go.clickmax_intake (
    lead_id text PRIMARY KEY REFERENCES bia_go.leads(id) ON DELETE CASCADE,
    contact_id uuid,
    dispatched_at timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    error_code text NOT NULL DEFAULT ''
);
ALTER TABLE bia_go.clickmax_cards ADD COLUMN IF NOT EXISTS auto_linked boolean NOT NULL DEFAULT false;
ALTER TABLE bia_go.clickmax_cards ADD COLUMN IF NOT EXISTS meeting_synced_start timestamptz;
INSERT INTO bia_go.schema_versions(version) VALUES(25) ON CONFLICT DO NOTHING;
