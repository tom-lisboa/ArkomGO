package main

import (
	"deeph/pkg/construction"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestRuntimeIntegrationRecordsPersistence(t *testing.T) {
	if os.Getenv("ARKOM_RUNTIME_INTEGRATION") != "true" {
		t.Skip("requires isolated executor; enabled in CI")
	}
	a, creds, db := genesisApp(t)
	b := dataFixtureBuild(t, a, "records")
	admin := login(t, a, creds, "alfa.admin")
	startData(t, a, admin, b.ID)
	call := func(app *App, key, method, body string, status int) string {
		t.Helper()
		code, out := req(app, "POST", dataBase(b.ID)+"/request", key, "", construction.RuntimeRequest{Method: method, Path: "/api/notes", Body: body})
		if code != 200 || out["status"] != float64(status) || out["record_create"] != nil {
			t.Fatal(code, out)
		}
		return out["body"].(string)
	}
	var first construction.Record
	if err := json.Unmarshal([]byte(call(a, admin, "POST", `{"text":"Primeira anotação — ação"}`, 201)), &first); err != nil || first.ID == "" || first.CreatedAt.IsZero() {
		t.Fatal(first, err)
	}
	call(a, admin, "POST", `{"text":"Segunda anotação"}`, 201)
	call(a, admin, "POST", `{"text":"","organization_id":"forged"}`, 400)
	call(a, admin, "POST", `{"text":"trailing"}{}`, 400)
	a.runtimeMu.Lock()
	proc := a.runtimes[b.ID].process
	a.runtimeMu.Unlock()
	stopData(t, a, admin, b.ID)
	select {
	case <-proc.Done():
	case <-time.After(10 * time.Second):
		t.Fatal("old process did not stop")
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	restored, nextCreds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	admin = login(t, restored, nextCreds, "alfa.admin")
	startData(t, restored, admin, b.ID)
	var listed struct {
		Items []construction.Record `json:"items"`
		Org   string                `json:"organization_id"`
	}
	if err := json.Unmarshal([]byte(call(restored, admin, "GET", "", 200)), &listed); err != nil || len(listed.Items) != 2 || listed.Org != "org_demo_alfa" {
		t.Fatal(listed, err)
	}
	if listed.Items[0].ID != first.ID || listed.Items[1].ID == first.ID || !listed.Items[0].CreatedAt.Equal(first.CreatedAt) || string(listed.Items[0].Value) != string(first.Value) || string(listed.Items[1].Value) != `{"text":"Segunda anotação"}` {
		t.Fatal("records changed across process/service restart", listed)
	}
	for i := 2; i < construction.MaxRecords; i++ {
		call(restored, admin, "POST", fmt.Sprintf(`{"text":"Anotação %d"}`, i+1), 201)
	}
	call(restored, admin, "POST", `{"text":"Não deve caber"}`, 409)
	if err := json.Unmarshal([]byte(call(restored, admin, "GET", "", 200)), &listed); err != nil || len(listed.Items) != construction.MaxRecords {
		t.Fatal("quota changed persisted collection", listed, err)
	}
	var count int
	if err := restored.db.QueryRow("SELECT COUNT(*) FROM audit WHERE action='preview.record_created'").Scan(&count); err != nil || count != construction.MaxRecords {
		t.Fatal("uncommitted record receipt", count, err)
	}
}
