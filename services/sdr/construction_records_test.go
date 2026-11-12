package main

import (
	"deeph/pkg/construction"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func recordReply(in construction.RuntimeRequest) construction.RuntimeReply {
	if in.Method == "POST" {
		if in.Records == nil {
			return construction.RuntimeReply{Status: 503, Body: "unavailable"}
		}
		v := &construction.Record{ID: in.Records.NextID, CreatedAt: in.Records.NextCreatedAt, Value: json.RawMessage(in.Body)}
		body, _ := json.Marshal(v)
		return construction.RuntimeReply{Status: 201, Body: string(body), RecordCreate: v}
	}
	items, _ := json.Marshal(in.Records.Items)
	return construction.RuntimeReply{Status: 200, Body: string(items)}
}
func readRecords(t *testing.T, a *App, key, id string) []construction.Record {
	t.Helper()
	code, out := dataCall(a, key, id, "GET", "")
	var items []construction.Record
	if code != 200 || out["record_create"] != nil || json.Unmarshal([]byte(out["body"].(string)), &items) != nil {
		t.Fatal(code, out)
	}
	return items
}
func TestPreviewRecordsPersistInOrderWithTenantApplicationAndRevisionScope(t *testing.T) {
	a, creds, db := genesisApp(t)
	b := previewBuild(t, a)
	dataStarter(a, recordReply)
	cloneDataBuild(t, a, b, "beta", "org_demo_beta", b.ApplicationID, 1)
	cloneDataBuild(t, a, b, "other", b.Org, "app_other", 1)
	cloneDataBuild(t, a, b, "revision2", b.Org, b.ApplicationID, 2)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	startData(t, a, admin, b.ID)
	if items := readRecords(t, a, admin, b.ID); items == nil || len(items) != 0 {
		t.Fatal("new collection must encode an empty array", items)
	}
	for _, value := range []string{`{"note":"private-first","organization_id":"org_demo_beta","application_id":"app_other"}`, `{"note":"second"}`} {
		if code, out := dataCall(a, admin, b.ID, "POST", value); code != 200 || out["status"] != float64(201) || out["record_create"] != nil {
			t.Fatal(code, out)
		}
	}
	items := readRecords(t, a, admin, b.ID)
	if len(items) != 2 || !strings.Contains(string(items[0].Value), "private-first") || !strings.Contains(string(items[1].Value), "second") || items[0].ID == "" || items[0].ID == items[1].ID || items[0].CreatedAt.IsZero() {
		t.Fatal("lost records, identity or creation order", items)
	}
	if code, _ := dataCall(a, beta, b.ID, "GET", ""); code != 404 {
		t.Fatal("cross-tenant access", code)
	}
	if code, _ := dataCall(a, viewer, b.ID, "POST", `{}`); code != 403 {
		t.Fatal("viewer created record", code)
	}
	if code, _ := req(a, "POST", dataBase(b.ID)+"/request", admin, "", map[string]any{"method": "GET", "path": "/api/history", "records": map[string]any{"next_id": "forged"}}); code != 400 {
		t.Fatal("client supplied host snapshot", code)
	}
	_, project := req(a, "GET", "/v1/sdr/genesis-demo/construction/"+b.ID, admin, "", nil)
	raw, _ := json.Marshal(project)
	if strings.Contains(string(raw), "private-first") {
		t.Fatal("customer data leaked into agent traces/files")
	}
	startData(t, a, beta, "beta")
	if len(readRecords(t, a, beta, "beta")) != 0 {
		t.Fatal("same application ID crossed companies")
	}
	stopData(t, a, admin, b.ID)
	startData(t, a, admin, "other")
	if len(readRecords(t, a, admin, "other")) != 0 {
		t.Fatal("application isolation failed")
	}
	stopData(t, a, admin, "other")
	startData(t, a, admin, "revision2")
	if got := readRecords(t, a, admin, "revision2"); len(got) != 2 || got[0].ID != items[0].ID {
		t.Fatal("revision did not share collection", got)
	}
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	restored, nextCreds, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	dataStarter(restored, recordReply)
	admin = login(t, restored, nextCreds, "alfa.admin")
	startData(t, restored, admin, "revision2")
	got := readRecords(t, restored, admin, "revision2")
	if len(got) != 2 || got[0].ID != items[0].ID || !got[0].CreatedAt.Equal(items[0].CreatedAt) || string(got[1].Value) != string(items[1].Value) {
		t.Fatal("restart changed collection", got)
	}
	var count int
	if err := restored.db.QueryRow("SELECT COUNT(*) FROM audit WHERE action='preview.record_created'").Scan(&count); err != nil || count != 2 {
		t.Fatal("incorrect commit receipts", count, err)
	}
}

func TestPreviewRecordsValidateAndCommitAllMutationsAtomically(t *testing.T) {
	for _, kind := range []string{"success", "commit_failure", "invalid_id", "invalid_time", "invalid_json", "oversize", "limit", "handler_failure", "no_database", "legacy"} {
		t.Run(kind, func(t *testing.T) {
			a, creds, _ := genesisApp(t)
			b := previewBuild(t, a)
			if kind == "legacy" {
				delete(b.Files, construction.RecordsContractPath)
				cloneDataBuild(t, a, b, b.ID, b.Org, b.ApplicationID, 1)
			}
			if kind == "limit" {
				a.state.Platform.PreviewRecords = map[string]map[string][]construction.Record{b.Org: {b.ApplicationID: make([]construction.Record, construction.MaxRecords)}}
			}
			dataStarter(a, func(in construction.RuntimeRequest) construction.RuntimeReply {
				if in.Records == nil {
					in.Records = &construction.RecordsSnapshot{NextID: "forged", NextCreatedAt: time.Now()}
				}
				out := recordReply(in)
				out.DataWrite = &construction.DataWrite{Value: json.RawMessage(`"document and record together"`)}
				switch kind {
				case "invalid_id":
					out.RecordCreate.ID = "forged"
				case "invalid_time":
					out.RecordCreate.CreatedAt = time.Time{}
				case "invalid_json":
					out.RecordCreate.Value = json.RawMessage(`{`)
				case "oversize":
					out.RecordCreate.Value = json.RawMessage(`"` + strings.Repeat("x", construction.MaxRecordBytes) + `"`)
				case "handler_failure":
					out.Status = 500
				}
				return out
			})
			admin := login(t, a, creds, "alfa.admin")
			startData(t, a, admin, b.ID)
			if kind == "commit_failure" {
				a.failSave = true
			}
			if kind == "no_database" {
				a.db.Close()
				a.db = nil
			}
			code, out := dataCall(a, admin, b.ID, "POST", `{"text":"record"}`)
			a.failSave = false
			want := 502
			switch kind {
			case "success", "handler_failure":
				want = 200
			case "commit_failure", "no_database":
				want = 503
			case "legacy", "limit":
				want = 409
			}
			if code != want || out["record_create"] != nil || out["data_write"] != nil {
				t.Fatal(code, out)
			}
			got := len(a.state.Platform.PreviewRecords[b.Org][b.ApplicationID])
			wantRecords, wantAudits := 0, 0
			if kind == "success" {
				wantRecords, wantAudits = 1, 2
			} else if kind == "limit" {
				wantRecords = construction.MaxRecords
			}
			doc := a.state.Platform.PreviewData[b.Org][b.ApplicationID]
			if got != wantRecords || (doc != nil) != (kind == "success") {
				t.Fatal("partial or failed write persisted", got, doc)
			}
			if a.db != nil {
				var count int
				if err := a.db.QueryRow("SELECT COUNT(*) FROM audit WHERE action IN ('preview.record_created','preview.data_saved')").Scan(&count); err != nil || count != wantAudits {
					t.Fatal("failed transaction published audit", count, err)
				}
			}
		})
	}
}

func TestPreviewRecordsRejectLateOrConflictingCreates(t *testing.T) {
	for _, kind := range []string{"stopped", "restarted", "conflict"} {
		t.Run(kind, func(t *testing.T) {
			a, creds, _ := genesisApp(t)
			b := previewBuild(t, a)
			admin := login(t, a, creds, "alfa.admin")
			entered, release := make(chan struct{}), make(chan struct{})
			dataStarter(a, func(in construction.RuntimeRequest) construction.RuntimeReply {
				close(entered)
				<-release
				return recordReply(in)
			})
			startData(t, a, admin, b.ID)
			result := make(chan int, 1)
			go func() { code, _ := dataCall(a, admin, b.ID, "POST", `"late"`); result <- code }()
			<-entered
			if kind == "conflict" {
				a.mu.Lock()
				snapshot := a.previewRecords(b.Org, b.ApplicationID)
				created := &construction.Record{ID: snapshot.NextID, CreatedAt: snapshot.NextCreatedAt, Value: json.RawMessage(`"newer"`)}
				err := a.savePreviewMutations(User{Org: b.Org, ID: "admin"}, b.ApplicationID, 0, nil, snapshot, created)
				a.mu.Unlock()
				if err != nil {
					t.Fatal(err)
				}
			} else {
				stopData(t, a, admin, b.ID)
			}
			if kind == "restarted" {
				dataStarter(a, recordReply)
				startData(t, a, admin, b.ID)
				if code, _ := dataCall(a, admin, b.ID, "POST", `"newer"`); code != 200 {
					t.Fatal(code)
				}
			}
			close(release)
			select {
			case code := <-result:
				if code != 409 {
					t.Fatal("late create was accepted", code)
				}
			case <-time.After(time.Second):
				t.Fatal("request stuck")
			}
			items := a.state.Platform.PreviewRecords[b.Org][b.ApplicationID]
			if kind == "stopped" {
				if len(items) != 0 {
					t.Fatal("stopped process wrote record")
				}
			} else if len(items) != 1 || string(items[0].Value) != `"newer"` {
				t.Fatal("late create changed records", items)
			}
		})
	}
}
