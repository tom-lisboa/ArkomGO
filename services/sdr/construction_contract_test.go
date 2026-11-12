package main

import (
	"archive/zip"
	"bytes"
	"context"
	"deeph/pkg/application"
	"deeph/pkg/construction"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
)

func contractFiles() map[string]string {
	files := construction.Seed()
	files[application.ManifestPath] = `{"schema_version":"arkom.application.v1","catalog_version":"arkom-capabilities-v1","name":"Calculadora","backend":"go","entrypoint":"frontend/index.html","routes":[{"method":"POST","path":"/api/calculate","operation_id":"calculate"}],"capabilities":[]}`
	files["frontend/index.html"] = "<h1>Calculator</h1>"
	files["backend/calculate.go"] = "package calculator"
	return files
}
func TestConstructionContractLifecycle(t *testing.T) {
	a, creds, db := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	b := &ConstructionBuild{ID: "contract-test", ApplicationID: "app_test", Revision: 1, Org: "org_demo_alfa", Status: "running", Files: contractFiles()}
	if err := a.transact(func() { a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b} }); err != nil {
		t.Fatal(err)
	}
	path := "/v1/sdr/genesis-demo/construction/" + b.ID
	if code, _ := req(a, "GET", path+"/contract", beta, "", nil); code != 404 {
		t.Fatal("cross tenant contract", code)
	}
	if code, _ := req(a, "GET", path+"/contract", "", "", nil); code != 401 {
		t.Fatal("anonymous contract", code)
	}
	if code, out := req(a, "GET", path+"/contract", admin, "", nil); code != 200 || out["status"] != "pending" || out["contract"] != nil {
		t.Fatal(code, out)
	}
	a.failSave = true
	a.finishConstruction(b.ID, nil, nil)
	a.failSave = false
	if a.state.Platform.Constructions[b.ID].Contract != nil || a.state.Platform.Constructions[b.ID].Status != "running" {
		t.Fatal("uncommitted contract leaked")
	}
	a.finishConstruction(b.ID, nil, nil)
	b = a.state.Platform.Constructions[b.ID]
	if b.Status != "ready" || b.contractStatus() != "validated" {
		t.Fatal("contract not sealed", b)
	}
	if code, out := req(a, "GET", path+"/contract", admin, "", nil); code != 200 || out["status"] != "validated" || out["contract"] == nil {
		t.Fatal(code, out)
	}
	// Export the exact host contract alongside the agent's declaration.
	r := httptest.NewRequest("GET", path+"/export", nil)
	r.Header.Set("Authorization", "Bearer "+admin)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	z, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, f := range z.File {
		if f.Name == "application-contract.json" {
			rc, _ := f.Open()
			raw, _ := io.ReadAll(rc)
			rc.Close()
			var c application.Contract
			if json.Unmarshal(raw, &c) != nil || !c.Matches(b.ApplicationID, b.Revision, b.Files) {
				t.Fatal("export mismatch")
			}
			found = true
		}
	}
	if !found {
		t.Fatal("missing exported contract")
	}
	a.Close()
	restored, _, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	saved := restored.state.Platform.Constructions[b.ID]
	if saved.contractStatus() != "validated" {
		t.Fatal("contract lost after restart")
	}
	saved.Files["backend/calculate.go"] += "\n// changed"
	if saved.contractStatus() != "invalid" {
		t.Fatal("modified source trusted")
	}
}
func TestConstructionContractCannotSealInvalidOrCancelled(t *testing.T) {
	for _, cancelled := range []bool{false, true} {
		a, _, _ := genesisApp(t)
		b := &ConstructionBuild{ID: "bad", ApplicationID: "app_bad", Revision: 1, Org: "org_demo_alfa", Status: "running", Files: contractFiles()}
		var ctxErr error
		if cancelled {
			ctxErr = context.Canceled
		} else {
			delete(b.Files, application.ManifestPath)
		}
		a.state.Platform.Constructions = map[string]*ConstructionBuild{b.ID: b}
		a.finishConstruction(b.ID, nil, ctxErr)
		if b.Status == "ready" || b.Contract != nil {
			t.Fatal("invalid build sealed")
		}
	}
}
func TestConstructionIdentityAndLegacyCompatibility(t *testing.T) {
	a, creds, _ := genesisApp(t)
	parent := &ConstructionBuild{ID: "p", ApplicationID: "app_original", Revision: 1, Org: "org_demo_alfa", Status: "ready", Files: contractFiles()}
	a.state.Platform.Constructions = map[string]*ConstructionBuild{"p": parent, "newer": {ApplicationID: "app_original", Revision: 3, Org: parent.Org}, "other": {ApplicationID: "app_original", Revision: 99, Org: "org_demo_beta"}, "legacy": {ID: "legacy", Org: parent.Org, Status: "ready", Files: construction.Seed()}}
	id, rev := a.constructionIdentity(parent.Org, parent)
	if id != parent.ApplicationID || rev != 4 {
		t.Fatal("fork revision", id, rev)
	}
	id, rev = a.constructionIdentity(parent.Org, a.state.Platform.Constructions["legacy"])
	if id == parent.ApplicationID || rev != 1 {
		t.Fatal("legacy continuation identity")
	}
	admin := login(t, a, creds, "alfa.admin")
	if code, out := req(a, "GET", "/v1/sdr/genesis-demo/construction/legacy/contract", admin, "", nil); code != 200 || out["status"] != "legacy" || out["contract"] != nil {
		t.Fatal(code, out)
	}
}
