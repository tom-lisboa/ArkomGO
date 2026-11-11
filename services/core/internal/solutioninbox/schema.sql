CREATE SCHEMA IF NOT EXISTS solution_inbox;
CREATE TABLE IF NOT EXISTS solution_inbox.deliveries (
    id text PRIMARY KEY,
    destination text NOT NULL CHECK(destination IN ('social','finance','bia-sdr')),
    organization_id uuid NOT NULL,
    actor_id uuid,
    event_id text NOT NULL,
    event_hash text NOT NULL,
    project_id text NOT NULL,
    state text NOT NULL CHECK(state IN ('draft','received')),
    media bytea CHECK(media IS NULL OR octet_length(media) BETWEEN 12 AND 10485760),
    media_sha256 text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(destination,organization_id,event_id)
);
CREATE TABLE IF NOT EXISTS solution_inbox.health (
    destination text PRIMARY KEY,
    seen_at timestamptz NOT NULL
);
