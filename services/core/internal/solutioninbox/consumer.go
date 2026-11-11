// Package solutioninbox implements durable connectors, not financial commands,
// social-network publication, or outbound customer messages.
package solutioninbox

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	contract "arkom/bia/pkg/solutionbus"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var Schema string

type Connector struct {
	Destination string
	Client      contract.Client
	DB          *pgxpool.Pool
}
type ClipArtifact struct {
	ProjectID   string `json:"project_id"`
	ArtifactID  string `json:"artifact_id"`
	SHA256      string `json:"sha256"`
	Bytes       int    `json:"bytes"`
	ContentType string `json:"content_type"`
}

func (c Connector) Poll(ctx context.Context) error {
	if c.Destination != "social" && c.Destination != "finance" && c.Destination != "bia-sdr" {
		return errors.New("invalid connector destination")
	}
	events, err := c.Client.Pending(ctx, "clips")
	if err != nil {
		return err
	}
	for _, event := range events {
		if event.Type != "clips.export.completed.v1" {
			continue
		}
		if err := c.accept(ctx, event); err != nil {
			return err
		}
	}
	_, err = c.DB.Exec(ctx, `INSERT INTO solution_inbox.health(destination,seen_at) VALUES($1,now()) ON CONFLICT(destination) DO UPDATE SET seen_at=excluded.seen_at`, c.Destination)
	return err
}

func (c Connector) accept(ctx context.Context, event contract.Event) error {
	if event.OrganizationID != c.Client.OrganizationID {
		return errors.New("connector organization mismatch")
	}
	var asset ClipArtifact
	if json.Unmarshal(event.Data, &asset) != nil || asset.ProjectID == "" || asset.ArtifactID == "" || asset.ContentType != "video/mp4" || len(asset.SHA256) != 64 || asset.Bytes < 12 || asset.Bytes > 10<<20 {
		return errors.New("invalid clip artifact event")
	}
	body, _ := json.Marshal(event)
	fingerprint := fmt.Sprintf("%x", sha256.Sum256(body))
	id := c.Destination + "-" + event.ID
	state := "received"
	if c.Destination == "social" {
		state = "draft"
	}
	var created time.Time
	var prior string
	err := c.DB.QueryRow(ctx, `SELECT event_hash,created_at FROM solution_inbox.deliveries
		WHERE destination=$1 AND organization_id=$2 AND event_id=$3`, c.Destination, event.OrganizationID, event.ID).Scan(&prior, &created)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil && prior != fingerprint {
		return errors.New("conflicting inbox event")
	}
	if errors.Is(err, pgx.ErrNoRows) {
		var media []byte
		var mediaHash *string
		if c.Destination == "social" {
			media, err = c.Client.Artifact(ctx, asset.ArtifactID)
			if err != nil {
				return err
			}
			hash := fmt.Sprintf("%x", sha256.Sum256(media))
			if len(media) != asset.Bytes || len(media) < 12 || string(media[4:8]) != "ftyp" || hash != asset.SHA256 {
				return errors.New("artifact integrity check failed")
			}
			mediaHash = &hash
		}
		err = c.DB.QueryRow(ctx, `INSERT INTO solution_inbox.deliveries(id,destination,organization_id,actor_id,event_id,event_hash,project_id,state,media,media_sha256)
			VALUES($1,$2,$3,NULLIF($4,'')::uuid,$5,$6,$7,$8,$9,$10)
			ON CONFLICT(destination,organization_id,event_id) DO UPDATE SET id=solution_inbox.deliveries.id
			WHERE solution_inbox.deliveries.event_hash=excluded.event_hash RETURNING created_at`,
			id, c.Destination, event.OrganizationID, event.ActorID, event.ID, fingerprint, asset.ProjectID, state, media, mediaHash).Scan(&created)
		if err != nil {
			return err
		}
	}
	// Stable receipt body/time survives retries and process restarts.
	data, _ := json.Marshal(map[string]string{"receipt_id": id, "project_id": asset.ProjectID, "state": state, "source_event_id": event.ID})
	kind := c.Destination + ".integration.received.v1"
	if c.Destination == "social" {
		kind = "social.draft.created.v1"
	}
	if err := c.Client.Publish(ctx, contract.Event{ID: "receipt-" + id, OrganizationID: event.OrganizationID, Source: c.Destination, Type: kind, Subject: "receipts/" + id, OccurredAt: created.UTC(), Data: data}); err != nil {
		return err
	}
	return c.Client.Acknowledge(ctx, event, id)
}
