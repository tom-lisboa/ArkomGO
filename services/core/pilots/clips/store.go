package main

import (
	"arkom/bia/internal/solutionbus"
	contract "arkom/bia/pkg/solutionbus"
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

const maxAttempts = 3

var errKeyConflict = errors.New("idempotency key already used with a different fixture")

type job struct {
	ID        string          `json:"id"`
	Fixture   string          `json:"fixture"`
	Status    string          `json:"status"`
	Attempts  int             `json:"attempts"`
	Result    json.RawMessage `json:"result,omitempty"`
	ErrorCode *string         `json:"error_code,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type queue struct {
	gifs         *gifConfig
	db           *pgxpool.Pool
	video        *videoWorker
	studio       string
	uploads      chan struct{}
	hosted       bool
	integrations bool
}

const jobColumns = "id, fixture, status, attempts, result, error_code, created_at, updated_at"

func scanJob(row pgx.Row) (job, error) {
	var j job
	err := row.Scan(&j.ID, &j.Fixture, &j.Status, &j.Attempts, &j.Result, &j.ErrorCode, &j.CreatedAt, &j.UpdatedAt)
	return j, err
}

func (q queue) enqueue(ctx context.Context, key, fixture string) (job, bool, error) {
	j, err := scanJob(q.db.QueryRow(ctx, `
		INSERT INTO jobs (id, idempotency_key, fixture) VALUES ($1, $2, $3)
		ON CONFLICT (idempotency_key) DO NOTHING
		RETURNING `+jobColumns, rand.Text(), key, fixture))
	if !errors.Is(err, pgx.ErrNoRows) {
		return j, err == nil, err
	}

	// A new statement sees the concurrent insert after ON CONFLICT has waited for it.
	j, err = scanJob(q.db.QueryRow(ctx, `SELECT `+jobColumns+` FROM jobs WHERE idempotency_key = $1`, key))
	if err == nil && j.Fixture != fixture {
		return job{}, false, errKeyConflict
	}
	return j, false, err
}

func (q queue) get(ctx context.Context, id string) (job, error) {
	return scanJob(q.db.QueryRow(ctx, `SELECT `+jobColumns+` FROM jobs WHERE id = $1`, id))
}

func (q queue) claim(ctx context.Context) (job, error) {
	leaseSeconds := 10
	if q.video != nil {
		leaseSeconds = 30
	}
	if q.studio != "" {
		leaseSeconds = 100
	}
	if q.hosted {
		leaseSeconds = 480
	}
	return scanJob(q.db.QueryRow(ctx, `
		WITH candidate AS (
			SELECT id FROM jobs
			WHERE attempts < $1 AND (
				(status = 'queued' AND available_at <= now()) OR
				(status = 'running' AND lease_until <= now())
			)
			ORDER BY available_at, created_at, id
			LIMIT 1 FOR UPDATE SKIP LOCKED
		)
		UPDATE jobs SET status = 'running', attempts = attempts + 1,
			lease_until = now() + ($2::integer * interval '1 second'), error_code = NULL, updated_at = now()
		WHERE id = (SELECT id FROM candidate)
		RETURNING `+jobColumns, maxAttempts, leaseSeconds))
}

func (q queue) expireFinalAttempts(ctx context.Context) error {
	_, err := q.db.Exec(ctx, `
		UPDATE jobs SET status = 'failed', lease_until = NULL,
			error_code = 'lease_expired', updated_at = now()
		WHERE status = 'running' AND lease_until <= now() AND attempts >= $1`, maxAttempts)
	return err
}

func (q queue) finish(ctx context.Context, j job, result json.RawMessage, mp4 []byte, errorCode *string) (bool, error) {
	status := "succeeded"
	if errorCode != nil {
		status = "queued"
		if j.Attempts >= maxAttempts {
			status = "failed"
		}
	}

	tx, err := q.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	// The attempt number fences off a worker whose lease expired or was taken over.
	tag, err := tx.Exec(ctx, `
		UPDATE jobs SET status = $3, result = $4, error_code = $5, lease_until = NULL,
			available_at = now() + ($2::integer * interval '1 second'), updated_at = now()
		WHERE id = $1 AND attempts = $2 AND status = 'running' AND lease_until > clock_timestamp()`,
		j.ID, j.Attempts, status, result, errorCode)
	if err != nil || tag.RowsAffected() != 1 {
		return false, err
	}
	if len(mp4) > 0 {
		if _, err := tx.Exec(ctx, `INSERT INTO job_videos (job_id, mp4) VALUES ($1, $2)`, j.ID, mp4); err != nil {
			return false, err
		}
		// A public project and its event commit with the MP4. Technical fixtures
		// have no app_projects row and are not broadcast to customer integrations.
		if q.integrations {
			var organization, actor string
			err := tx.QueryRow(ctx, `SELECT g.organization_id::text,p.account_id::text FROM app_projects p
			JOIN platform_access g ON g.account_id=p.account_id AND g.solution='clips' AND g.enabled
			JOIN platform_organizations o ON o.id=g.organization_id AND o.enabled WHERE p.job_id=$1`, j.ID).Scan(&organization, &actor)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				// Older local modes do not mount the application schema.
				return false, err
			}
			if err == nil {
				data, _ := json.Marshal(map[string]any{"project_id": j.ID, "artifact_id": j.ID, "content_type": "video/mp4", "sha256": fmt.Sprintf("%x", sha256.Sum256(mp4)), "width": 720, "height": 1280, "bytes": len(mp4)})
				event := contract.Event{ID: "clips-export-" + j.ID, OrganizationID: organization, ActorID: actor, Source: "clips", Type: "clips.export.completed.v1", Subject: "projects/" + j.ID, OccurredAt: time.Now().UTC(), Data: data}
				if err := solutionbus.PublishTx(ctx, tx, event); err != nil {
					return false, err
				}
			}
		}
	}
	return true, tx.Commit(ctx)
}
