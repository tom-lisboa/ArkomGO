-- Reuse the durable scheduling queue and capacity holds for ClickMax writes.
ALTER TABLE bia_go.google_booking_ops ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
INSERT INTO bia_go.schema_versions(version) VALUES(24) ON CONFLICT DO NOTHING;
