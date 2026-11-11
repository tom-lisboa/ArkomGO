package main

import (
	"net/http/httptest"
	"testing"
)

func TestDemoRuntimeDoesNotOverrideNormalSecrets(t *testing.T) {
	t.Setenv("SDR_CRM_DEV_ENABLED", "")
	t.Setenv("SDR_LOCAL_SECRETS_DIR", "/tmp/demo")
	if got := localSecretPath("context-worker"); got != "/run/secrets/context-worker" {
		t.Fatal(got)
	}
}
func TestDemoWorkerRejectsPublicListener(t *testing.T) {
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	t.Setenv("SDR_LOCAL_WORKER_LISTEN", "0.0.0.0:9123")
	if localWorkerAddress() != "invalid-local-listen-address" {
		t.Fatal("public override accepted")
	}
}
func TestGenesisRequiresEnabledDemoAndSession(t *testing.T) {
	a := &App{}
	t.Setenv("SDR_GENESIS_DEMO", "")
	r := httptest.NewRequest("GET", "/v1/sdr/genesis-demo", nil)
	w := httptest.NewRecorder()
	a.genesisDemoHTTP(w, r)
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
	t.Setenv("SDR_GENESIS_DEMO", "true")
	t.Setenv("SDR_CRM_DEV_ENABLED", "true")
	w = httptest.NewRecorder()
	a.genesisDemoHTTP(w, r)
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
}
