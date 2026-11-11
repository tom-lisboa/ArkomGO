CREATE SEQUENCE IF NOT EXISTS bia_go.clickmax_public_closer_seq START 1000000000;
ALTER TABLE bia_go.slots ADD COLUMN IF NOT EXISTS clickmax_public boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS bia_go.clickmax_public_closers (
    attendant_id uuid PRIMARY KEY,
    closer_id bigint NOT NULL UNIQUE DEFAULT nextval('bia_go.clickmax_public_closer_seq')
);
CREATE TABLE IF NOT EXISTS bia_go.clickmax_public_bookings (
    appointment_id uuid PRIMARY KEY,
    contact_id uuid NOT NULL,
    lead_id text NOT NULL REFERENCES bia_go.leads(id) ON DELETE CASCADE,
    booking_id text NOT NULL REFERENCES bia_go.bookings(id),
    provider_updated_at timestamptz NOT NULL
);
INSERT INTO bia_go.schema_versions(version) VALUES(26) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS bia_go.clickmax_team_booking_attempts (
    operation_id text PRIMARY KEY,
    lead_id text NOT NULL REFERENCES bia_go.leads(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    card_id uuid,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    dispatched_at timestamptz NOT NULL DEFAULT now(),
    appointment_id uuid,
    failure text
);
ALTER TABLE bia_go.clickmax_public_bookings ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS clickmax_team_booking_pending
 ON bia_go.clickmax_team_booking_attempts(contact_id, schedule_id)
 WHERE appointment_id IS NULL AND failure IS NULL;
INSERT INTO bia_go.schema_versions(version) VALUES(27) ON CONFLICT DO NOTHING;

ALTER TABLE bia_go.clickmax_team_booking_attempts ADD COLUMN IF NOT EXISTS replaces_appointment_id uuid;
ALTER TABLE bia_go.clickmax_team_booking_attempts ADD COLUMN IF NOT EXISTS checked_at timestamptz;
CREATE INDEX IF NOT EXISTS clickmax_team_booking_reconcile
 ON bia_go.clickmax_team_booking_attempts(schedule_id, checked_at NULLS FIRST, dispatched_at)
 WHERE appointment_id IS NULL AND failure IS NULL;
INSERT INTO bia_go.schema_versions(version) VALUES(28) ON CONFLICT DO NOTHING;
