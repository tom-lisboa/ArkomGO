package solutionbus

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"arkom/bia/internal/crmsync"
	"arkom/bia/internal/platformdirectory"
	access "arkom/bia/pkg/platformaccess"
	contract "arkom/bia/pkg/solutionbus"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var Schema string

var uuidRE = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var idRE = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$`)
var eventRE = regexp.MustCompile(`^[a-z][a-z0-9-]{1,30}\.[a-z][a-z0-9_.-]{1,110}\.v[1-9][0-9]?$`)

func hash(value []byte) string { return fmt.Sprintf("%x", sha256.Sum256(value)) }
func validSolution(value string) bool {
	return value == "clips" || value == "social" || value == "finance" || value == "bia-sdr"
}
func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func fail(w http.ResponseWriter, status int, code string) {
	respond(w, status, map[string]string{"error": code})
}
func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(out) != nil || d.Decode(new(any)) != io.EOF {
		fail(w, 400, "invalid_event_document")
		return false
	}
	return true
}

func PublishTx(ctx context.Context, tx pgx.Tx, event contract.Event) error {
	if !idRE.MatchString(event.ID) || !uuidRE.MatchString(event.OrganizationID) || !validSolution(event.Source) || !eventRE.MatchString(event.Type) || !strings.HasPrefix(event.Type, event.Source+".") || len(event.Subject) > 200 || event.Subject == "" || len(event.Data) > 24<<10 || !json.Valid(event.Data) {
		return errors.New("invalid integration event")
	}
	if event.ActorID != "" && !uuidRE.MatchString(event.ActorID) {
		return errors.New("invalid integration actor")
	}
	if event.OccurredAt.IsZero() || event.OccurredAt.After(time.Now().Add(5*time.Minute)) {
		return errors.New("invalid integration event time")
	}
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}
	var canonical any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&canonical); err != nil {
		return err
	}
	body, err = json.Marshal(canonical)
	if err != nil {
		return err
	}
	var saved string
	err = tx.QueryRow(ctx, `INSERT INTO integration_outbox(id,organization_id,source_solution,event_type,subject,envelope,content_hash)
		VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET id=excluded.id
		WHERE integration_outbox.content_hash=excluded.content_hash RETURNING id`, event.ID, event.OrganizationID, event.Source, event.Type, event.Subject, body, hash(body)).Scan(&saved)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("integration event id already has different content")
	}
	return err
}

type Credential struct {
	ClientID       string `json:"client_id"`
	Solution       string `json:"solution"`
	OrganizationID string `json:"organization_id"`
	Token          string `json:"token"`
}

func Provision(ctx context.Context, db *pgxpool.Pool, solution, org string) (Credential, error) {
	if !validSolution(solution) || !uuidRE.MatchString(org) {
		return Credential{}, errors.New("invalid integration grant")
	}
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return Credential{}, err
	}
	c := Credential{Solution: solution, OrganizationID: org, Token: "arkom_service_" + base64.RawURLEncoding.EncodeToString(secret[:])}
	tx, err := db.Begin(ctx)
	if err != nil {
		return Credential{}, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `INSERT INTO integration_clients(name,solution,token_hash) VALUES($1,$2,$3) RETURNING id::text`, solution+"-"+org, solution, hash([]byte(c.Token))).Scan(&c.ClientID)
	if err != nil {
		return Credential{}, errors.New("client already exists or storage unavailable; existing token was preserved")
	}
	for _, source := range []string{"clips", "social", "finance", "bia-sdr"} {
		if _, err = tx.Exec(ctx, `INSERT INTO integration_grants(client_id,organization_id,source_solution,can_read,can_publish,can_artifacts)
			SELECT $1,$2::uuid,$3,$4,$5,$6 FROM platform_organizations WHERE id=$2::uuid AND enabled`, c.ClientID, org, source, source == "clips" || source == solution, source == solution, solution == "social" && source == "clips"); err != nil {
			return Credential{}, err
		}
	}
	var grants int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM integration_grants WHERE client_id=$1`, c.ClientID).Scan(&grants); err != nil || grants != 4 {
		return Credential{}, errors.New("organization is not enabled")
	}
	return c, tx.Commit(ctx)
}

type Server struct {
	CRM       *crmsync.Worker
	DB        *pgxpool.Pool
	Artifact  func(http.ResponseWriter, *http.Request, string)
	Directory *platformdirectory.Store
}
type principal struct {
	client, solution, organization string
	artifacts                      bool
}

func (s Server) authorize(w http.ResponseWriter, r *http.Request, source string, publish bool) (principal, bool) {
	var p principal
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	org := r.Header.Get("X-Organization-ID")
	if !strings.HasPrefix(token, "arkom_service_") || len(token) != 57 {
		fail(w, 401, "service_identity_required")
		return p, false
	}
	if !uuidRE.MatchString(org) || !validSolution(source) {
		fail(w, 403, "organization_or_source_denied")
		return p, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	err := s.DB.QueryRow(ctx, `SELECT c.id::text,c.solution,g.organization_id::text,g.can_artifacts
		FROM integration_clients c JOIN integration_grants g ON g.client_id=c.id JOIN platform_organizations o ON o.id=g.organization_id
		WHERE c.token_hash=$1 AND c.enabled AND o.enabled AND g.organization_id=$2 AND g.source_solution=$3
		AND (($4 AND g.can_publish AND c.solution=$3) OR (NOT $4 AND g.can_read))`, hash([]byte(token)), org, source, publish).Scan(&p.client, &p.solution, &p.organization, &p.artifacts)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 403, "service_scope_denied")
		return p, false
	}
	if err != nil {
		fail(w, 503, "integration_storage_unavailable")
		return p, false
	}
	if s.Directory != nil {
		if err := s.Directory.ServiceActive(ctx, p.client, p.organization, p.solution); err != nil {
			if errors.Is(err, access.ErrDenied) {
				fail(w, 403, "platform_access_denied")
			} else {
				fail(w, 503, "platform_directory_unavailable")
			}
			return p, false
		}
	}
	return p, true
}
func (s Server) Mount(mux *http.ServeMux) {
	if s.CRM != nil {
		mux.HandleFunc("POST /integration/v1/crm/{operation}", s.crm)
	}
	if s.Directory != nil {
		mux.HandleFunc("POST /integration/v1/identity/{solution}/resolve", s.resolveIdentity)
	}
	mux.HandleFunc("GET /integration/v1/inbox", s.inbox)
	mux.HandleFunc("GET /integration/v1/inbox/{id}/media", s.inboxMedia)
	mux.HandleFunc("GET /integration/v1/events", s.pending)
	mux.HandleFunc("POST /integration/v1/events", s.publish)
	mux.HandleFunc("POST /integration/v1/events/{id}/ack", s.ack)
	mux.HandleFunc("GET /integration/v1/artifacts/{id}", func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.authorize(w, r, "clips", false)
		if !ok {
			return
		}
		if !p.artifacts {
			fail(w, 403, "artifact_scope_denied")
			return
		}
		if s.Artifact == nil {
			fail(w, 503, "artifact_unavailable")
			return
		}
		s.Artifact(w, r, p.organization)
	})
	mux.HandleFunc("/integration/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "not_found") })
}
func (s Server) pending(w http.ResponseWriter, r *http.Request) {
	source := r.URL.Query().Get("source")
	p, ok := s.authorize(w, r, source, false)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	rows, err := s.DB.Query(ctx, `SELECT e.envelope FROM integration_outbox e WHERE e.organization_id=$1 AND e.source_solution=$2
		AND NOT EXISTS(SELECT 1 FROM integration_acks a WHERE a.client_id=$3 AND a.event_id=e.id)
		ORDER BY e.created_at,e.id LIMIT 50`, p.organization, source, p.client)
	if err != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	defer rows.Close()
	events := []json.RawMessage{}
	for rows.Next() {
		var event json.RawMessage
		if err := rows.Scan(&event); err != nil {
			fail(w, 503, "integration_storage_unavailable")
			return
		}
		events = append(events, event)
	}
	if rows.Err() != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	respond(w, 200, map[string]any{"events": events})
}
func (s Server) publish(w http.ResponseWriter, r *http.Request) {
	var event contract.Event
	if !decode(w, r, &event) {
		return
	}
	p, ok := s.authorize(w, r, event.Source, true)
	if !ok {
		return
	}
	if event.OrganizationID != p.organization {
		fail(w, 403, "organization_denied")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	defer tx.Rollback(ctx)
	if err = PublishTx(ctx, tx, event); err != nil {
		fail(w, 409, "invalid_or_conflicting_event")
		return
	}
	if event.Type == crmsync.EventType {
		switch err := crmsync.Enqueue(ctx, tx, p.organization, p.client, event.Subject, event.Data); {
		case errors.Is(err, crmsync.ErrRoute):
			fail(w, 403, "crm_route_denied")
			return
		case errors.Is(err, crmsync.ErrPayload):
			fail(w, 409, "invalid_or_conflicting_crm_opportunity")
			return
		case err != nil:
			fail(w, 503, "crm_storage_unavailable")
			return
		}
	}

	if err = tx.Commit(ctx); err != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	respond(w, 202, map[string]string{"event_id": event.ID})
}
func (s Server) ack(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authorize(w, r, r.URL.Query().Get("source"), false)
	if !ok {
		return
	}
	var input struct {
		Receipt string `json:"receipt_id"`
	}
	if !decode(w, r, &input) {
		return
	}
	if !idRE.MatchString(input.Receipt) || !idRE.MatchString(r.PathValue("id")) {
		fail(w, 400, "invalid_receipt")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var prior string
	err := s.DB.QueryRow(ctx, `INSERT INTO integration_acks(client_id,event_id,receipt_id)
		SELECT $1,e.id,$3 FROM integration_outbox e WHERE e.id=$2 AND e.organization_id=$4 AND e.source_solution=$5
		ON CONFLICT(client_id,event_id) DO UPDATE SET receipt_id=integration_acks.receipt_id RETURNING receipt_id`, p.client, r.PathValue("id"), input.Receipt, p.organization, r.URL.Query().Get("source")).Scan(&prior)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "event_not_found")
		return
	}
	if err != nil {
		fail(w, 503, "integration_storage_unavailable")
		return
	}
	if prior != input.Receipt {
		fail(w, 409, "receipt_conflict")
		return
	}
	w.WriteHeader(204)
}
