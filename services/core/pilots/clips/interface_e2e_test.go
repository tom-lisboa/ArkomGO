package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This server is compiled only by go test, uses a disposable database, and has
// no production runtime flag that can bypass customer authentication.
func TestOfficialInterfaceServer(t *testing.T) {
	if os.Getenv("CLIPS_INTERFACE_E2E") != "1" {
		t.Skip("browser integration runner only")
	}
	db := identityTestDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := db.Exec(ctx, interfaceSchema); err != nil {
		t.Fatal(err)
	}
	native := nativeAccountInput{Email: "native-test@bilhon.com", Password: os.Getenv("CLIPS_INTERFACE_NATIVE_PASSWORD"), Name: "Aluno de teste", Organization: "bilhon-homolog"}
	if native.Password != "" {
		body, _ := json.Marshal(native)
		if _, err := provisionNative(ctx, db, bytes.NewReader(body)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := provisionCustomer(ctx, db, strings.NewReader(os.Getenv("CLIPS_INTERFACE_ACCOUNT"))); err != nil {
		t.Fatal(err)
	}
	foreign, err := provisionCustomer(ctx, db, strings.NewReader(strings.ReplaceAll(strings.ReplaceAll(identityFixture, "owner@homolog.invalid", "foreign@homolog.invalid"), "31b05613f966", "31b05613f977")))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO jobs(id,idempotency_key,fixture,status,result) VALUES('FOREIGN-PROJECT','foreign','entrevista-demo','succeeded','{}');
		INSERT INTO studio_inputs(job_id,owner,fingerprint,source,start_seconds,duration_seconds)
		VALUES('FOREIGN-PROJECT','customer:'||'`+foreign.ID+`','foreign',decode('0000000c6674797069736f6d','hex'),0,1);
		INSERT INTO app_projects(job_id,account_id,title) VALUES('FOREIGN-PROJECT','`+foreign.ID+`','Another customer')`)
	if err != nil {
		t.Fatal(err)
	}
	q := queue{db: db, studio: os.Getenv("CLIPS_INTERFACE_FFMPEG"), uploads: make(chan struct{}, 1), integrations: true}
	mux := http.NewServeMux()
	q.mountStudio(mux)
	q.mountApp(mux)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	provider := os.Getenv("CLIPS_INTERFACE_AUTH_URL")
	if err := mountInterface(mux, os.Getenv("CLIPS_INTERFACE_DIST"), provider); err != nil {
		t.Fatal(err)
	}
	auth := identityAuth{db: db, origin: "https://127.0.0.1:18088", providerURL: provider, publishable: "sb_publishable_local", client: &http.Client{Timeout: 3 * time.Second}, throttle: &authThrottle{}}
	server := httptest.NewUnstartedServer(auth.protect(mux, strings.Repeat("t", 48)))
	server.Listener.Close()
	listener, err := net.Listen("tcp", "127.0.0.1:18088")
	if err != nil {
		t.Fatal(err)
	}
	server.Listener = listener
	server.StartTLS()
	defer server.Close()
	done := make(chan struct{})
	go func() { defer close(done); runWorker(ctx, q) }()
	defer func() { cancel(); <-done }()
	stop := os.Getenv("CLIPS_INTERFACE_STOP")
	if !filepath.IsAbs(stop) {
		t.Fatal("absolute stop file required")
	}
	if err := os.WriteFile(stop+".ready", []byte("ready"), 0600); err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(stop); err == nil {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}
