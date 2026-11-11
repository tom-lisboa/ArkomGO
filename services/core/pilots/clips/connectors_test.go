package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	broker "arkom/bia/internal/solutionbus"
	"arkom/bia/internal/solutioninbox"
	contract "arkom/bia/pkg/solutionbus"
)

func TestConnectorsPersistBeforeAckAndRecover(t *testing.T) {
	db := identityTestDB(t)
	ctx := context.Background()
	if _, err := db.Exec(ctx, interfaceSchema); err != nil {
		t.Fatal(err)
	}
	owner, err := provisionNative(ctx, db, strings.NewReader(`{"email":"native-test@bilhon.com","password":"synthetic-local-password","display_name":"Aluno de teste","organization":"bilhon-homolog"}`))
	if err != nil {
		t.Fatal(err)
	}
	q := queue{db: db, integrations: true}
	j, _, err := q.enqueue(ctx, "connector-video", "entrevista-demo")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `INSERT INTO studio_inputs(job_id,owner,fingerprint,source,start_seconds,duration_seconds)
		VALUES($1,$2,'fixture',decode('0000000c6674797069736f6d','hex'),0,1)`, j.ID, "customer:"+owner.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `INSERT INTO app_projects(job_id,account_id,title) VALUES($1,$2,'Connector test')`, j.ID, owner.ID); err != nil {
		t.Fatal(err)
	}
	claimed, err := q.claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	media := []byte{0, 0, 0, 12, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}
	if ok, err := q.finish(ctx, claimed, json.RawMessage(`{"test":true}`), media, nil); err != nil || !ok {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	(&broker.Server{DB: db, Artifact: q.integrationArtifact}).Mount(mux)
	var failAck atomic.Bool
	failAck.Store(true)
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/ack") && failAck.Load() {
			w.WriteHeader(503)
			return
		}
		mux.ServeHTTP(w, r)
	}))
	defer api.Close()
	clients := map[string]contract.Client{}
	for _, name := range []string{"social", "finance", "bia-sdr"} {
		key, err := broker.Provision(ctx, db, name, owner.OrganizationID)
		if err != nil {
			t.Fatal(err)
		}
		client := contract.Client{BaseURL: api.URL, Token: key.Token, OrganizationID: owner.OrganizationID, HTTP: api.Client()}
		clients[name] = client
	}
	connector := solutioninbox.Connector{Destination: "social", Client: clients["social"], DB: db}
	if err := connector.Poll(ctx); err == nil {
		t.Fatal("failed acknowledgement was reported as success")
	}
	var copies int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM solution_inbox.deliveries WHERE destination='social' AND state='draft'`).Scan(&copies); err != nil || copies != 1 {
		t.Fatal("draft was not saved before acknowledging", err)
	}
	if pending, err := clients["social"].Pending(ctx, "clips"); err != nil || len(pending) != 1 {
		t.Fatal("event was lost after failed acknowledgement")
	}
	failAck.Store(false)
	for _, name := range []string{"social", "finance", "bia-sdr"} {
		restarted := solutioninbox.Connector{Destination: name, Client: clients[name], DB: db}
		if err := restarted.Poll(ctx); err != nil {
			t.Fatal("connector did not recover", name, err)
		}
		if err := restarted.Poll(ctx); err != nil {
			t.Fatal("duplicate poll failed", name, err)
		}
	}
	var count int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM solution_inbox.deliveries`).Scan(&count); err != nil || count != 3 {
		t.Fatal("delivery duplicated across retry", err, count)
	}
	// Source deletion after all receipts does not destroy the SOCIAL copy.
	if _, err := db.Exec(ctx, `DELETE FROM studio_inputs WHERE job_id=$1`, j.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `DELETE FROM jobs WHERE id=$1`, j.ID); err != nil {
		t.Fatal(err)
	}
	var copied []byte
	if err := db.QueryRow(ctx, `SELECT media FROM solution_inbox.deliveries WHERE destination='social'`).Scan(&copied); err != nil || string(copied) != string(media) {
		t.Fatal("social draft depends on deleted source", err)
	}
	for _, name := range []string{"finance", "bia-sdr"} {
		var hasMedia bool
		if err := db.QueryRow(ctx, `SELECT media IS NOT NULL FROM solution_inbox.deliveries WHERE destination=$1`, name).Scan(&hasMedia); err != nil || hasMedia {
			t.Fatal("metadata connector stored a video without permission", name, err)
		}
	}
}
