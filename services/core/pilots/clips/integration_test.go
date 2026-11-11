package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	broker "arkom/bia/internal/solutionbus"
	contract "arkom/bia/pkg/solutionbus"
)

func TestNewBackendsExchangeScopedDurableEvents(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	if _, err := db.Exec(ctx, interfaceSchema); err != nil {
		t.Fatal(err)
	}
	native, err := provisionNative(ctx, db, strings.NewReader(`{"email":"native-test@bilhon.com","password":"synthetic-local-password","display_name":"Aluno de teste","organization":"bilhon-homolog"}`))
	if err != nil {
		t.Fatal(err)
	}
	other, err := provisionCustomer(ctx, db, strings.NewReader(identityFixture))
	if err != nil {
		t.Fatal(err)
	}
	q := queue{db: db, integrations: true}
	j, _, err := q.enqueue(ctx, "bus-integration-job", "entrevista-demo")
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO studio_inputs(job_id,owner,fingerprint,source,start_seconds,duration_seconds)
		VALUES($1,$2,'integration',decode('0000000c6674797069736f6d','hex'),0,1);
		`, j.ID, "customer:"+native.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `INSERT INTO app_projects(job_id,account_id,title) VALUES($1,$2,'Integration fixture')`, j.ID, native.ID); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	server := broker.Server{DB: db, Artifact: q.integrationArtifact}
	server.Mount(mux)
	api := httptest.NewServer(mux)
	defer api.Close()
	clients := map[string]contract.Client{}
	for _, solution := range []string{"clips", "social", "finance", "bia-sdr"} {
		credential, err := broker.Provision(ctx, db, solution, native.OrganizationID)
		if err != nil {
			t.Fatal(err)
		}
		clients[solution] = contract.Client{BaseURL: api.URL, Token: credential.Token, OrganizationID: native.OrganizationID, HTTP: api.Client()}
	}
	if pending, err := clients["social"].Pending(ctx, "clips"); err != nil || len(pending) != 0 {
		t.Fatal("uncommitted output was broadcast", err)
	}
	claimed, err := q.claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	video := []byte{0, 0, 0, 12, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}
	ok, err := q.finish(ctx, claimed, json.RawMessage(`{"download_path":"fixture"}`), video, nil)
	if err != nil || !ok {
		t.Fatal("video and event did not commit", err)
	}
	for solution, client := range clients {
		events, err := client.Pending(ctx, "clips")
		if err != nil || len(events) != 1 {
			t.Fatalf("%s did not receive event: %v", solution, err)
		}
		event := events[0]
		if event.Type != "clips.export.completed.v1" || event.OrganizationID != native.OrganizationID || event.ActorID != native.ID {
			t.Fatal("event lost organization or actor identity")
		}
		if again, err := client.Pending(ctx, "clips"); err != nil || len(again) != 1 || again[0].ID != event.ID {
			t.Fatal("unacknowledged event was lost")
		}
		if solution == "social" {
			artifact, err := client.Artifact(ctx, j.ID)
			if err != nil || string(artifact) != string(video) {
				t.Fatal("social could not fetch its authorized artifact", err)
			}
		} else if _, err := client.Artifact(ctx, j.ID); err == nil {
			t.Fatal("metadata consumer obtained video without artifact scope")
		}
		if err := client.Acknowledge(ctx, event, "receipt-"+solution); err != nil {
			t.Fatal(err)
		}
		if err := client.Acknowledge(ctx, event, "receipt-"+solution); err != nil {
			t.Fatal("duplicate receipt was not idempotent", err)
		}
		if err := client.Acknowledge(ctx, event, "different-receipt"); err == nil {
			t.Fatal("conflicting receipt replaced prior acknowledgement")
		}
		if pending, err := client.Pending(ctx, "clips"); err != nil || len(pending) != 0 {
			t.Fatal("acknowledged event was redelivered", err)
		}
	}
	foreign := clients["social"]
	foreign.OrganizationID = other.OrganizationID
	if _, err := foreign.Pending(ctx, "clips"); err == nil {
		t.Fatal("organization header bypassed service grant")
	}
	if _, err := foreign.Artifact(ctx, j.ID); err == nil {
		t.Fatal("organization header exposed another account artifact")
	}
	social := clients["social"]
	if err := social.Publish(ctx, contract.Event{ID: "forged-clips-event", OrganizationID: native.OrganizationID, Source: "clips", Type: "clips.export.completed.v1", Subject: "projects/fake", OccurredAt: time.Now().UTC(), Data: json.RawMessage(`{}`)}); err == nil {
		t.Fatal("social impersonated clips publisher")
	}
	event := contract.Event{ID: "social-draft-fixture", OrganizationID: native.OrganizationID, Source: "social", Type: "social.draft.created.v1", Subject: "drafts/test", OccurredAt: time.Now().UTC(), Data: json.RawMessage(`{"status":"draft"}`)}
	if err := social.Publish(ctx, event); err != nil {
		t.Fatal("social publisher could not write own event", err)
	}
	if err := social.Publish(ctx, event); err != nil {
		t.Fatal("duplicate publish lost idempotency", err)
	}
	event.Data = json.RawMessage(`{"status":"changed"}`)
	if err := social.Publish(ctx, event); err == nil {
		t.Fatal("event was replaced with conflicting content")
	}
	if _, err := clients["finance"].Pending(ctx, "social"); err == nil {
		t.Fatal("unconfigured flow was enabled implicitly")
	}
	if _, err := db.Exec(ctx, `UPDATE integration_clients SET enabled=false WHERE solution='social'`); err != nil {
		t.Fatal(err)
	}
	if _, err := social.Pending(ctx, "clips"); err == nil {
		t.Fatal("revoked service retained access")
	}
}
