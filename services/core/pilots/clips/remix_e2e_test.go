package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"arkom/bia/internal/platformdirectory"
	"github.com/jackc/pgx/v5"
)

// Test-only virtual hosts let a real browser exercise cross-site navigation and
// CORS while every byte is served from one disposable loopback TLS server.
func TestRemixInterfaceServer(t *testing.T) {
	if os.Getenv("CLIPS_REMIX_E2E") != "1" {
		t.Skip("isolated remix browser runner only")
	}
	db := identityTestDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := db.Exec(ctx, interfaceSchema+gifSchema); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(nativeAccountInput{Email: "remix-test@bilhon.com", Password: os.Getenv("CLIPS_REMIX_TEST_PASSWORD"), Name: "Cliente fictício", Organization: "bilhon-homolog"})
	owner, err := provisionNative(ctx, db, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	var animation bytes.Buffer
	palette := color.Palette{color.Black, color.White}
	frame := image.NewPaletted(image.Rect(0, 0, 4, 4), palette)
	if err := gif.EncodeAll(&animation, &gif.GIF{Image: []*image.Paletted{frame, frame}, Delay: []int{20, 20}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO gif_jobs(account_id,prompt,sponsored,status,image) VALUES($1,'GIF fixture',false,'done',$2)`, owner.ID, animation.Bytes()); err != nil {
		t.Fatal(err)
	}
	foreign, err := provisionCustomer(ctx, db, strings.NewReader(identityFixture))
	if err != nil {
		t.Fatal(err)
	}
	batch := &pgx.Batch{}
	batch.Queue(`INSERT INTO jobs(id,idempotency_key,fixture,status,result) VALUES('FOREIGN-PROJECT','foreign','entrevista-demo','succeeded','{}')`)
	batch.Queue(`INSERT INTO studio_inputs(job_id,owner,fingerprint,source,start_seconds,duration_seconds) VALUES('FOREIGN-PROJECT','customer:'||$1,'foreign',decode('0000000c6674797069736f6d','hex'),0,1)`, foreign.ID)
	batch.Queue(`INSERT INTO app_projects(job_id,account_id,title) VALUES('FOREIGN-PROJECT',$1,'Outro cliente')`, foreign.ID)
	err = db.SendBatch(ctx, batch).Close()
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewUnstartedServer(nil)
	defer server.Listener.Close()
	port := server.Listener.Addr().(*net.TCPAddr).Port
	hub := fmt.Sprintf("https://clips.hub.localhost:%d", port)
	front := fmt.Sprintf("https://alfa.remix.localhost:%d", port)
	copied := fmt.Sprintf("https://copied.remix.localhost:%d", port)
	directory := platformdirectory.Store{DB: db}
	_, err = directory.Register(ctx, platformdirectory.Registration{Namespace: "remix-browser", Key: "register", CustomerReference: "alfa", OrganizationReference: "alfa", Name: "Cliente fictício", ExistingOrganizationID: owner.OrganizationID,
		Members: []platformdirectory.MemberInput{{Reference: "owner", Name: "Cliente fictício"}}, Products: []platformdirectory.ProductInput{{Solution: "clips", Backend: "clips-browser", LocalOrganizationID: owner.WorkspaceID, Grants: []platformdirectory.GrantInput{{PersonReference: "owner", LocalActorID: owner.ID, Role: "operator"}}}}})
	if err != nil {
		t.Fatal(err)
	}
	installation, err := directory.RegisterInstallation(ctx, platformdirectory.InstallationInput{Key: "install", OrganizationID: owner.OrganizationID, Backend: "clips-browser", Solution: "clips", Origin: front, APIURL: hub, SourceReference: "fictitious-remix", VerificationReference: "verified-local-fixture"}, true)
	if err != nil {
		t.Fatal(err)
	}
	q := queue{db: db, gifs: testGIFConfig(t), studio: os.Getenv("CLIPS_INTERFACE_FFMPEG"), uploads: make(chan struct{}, 1)}
	mux := http.NewServeMux()
	q.mountStudio(mux)
	q.mountApp(mux)
	if err := mountInterface(mux, os.Getenv("CLIPS_REMIX_HUB_DIST"), "https://auytmefqnuzbktyzcled.supabase.co"); err != nil {
		t.Fatal(err)
	}
	auth := identityAuth{db: db, origin: hub, providerURL: "http://127.0.0.1:1", publishable: "sb_publishable_local", client: &http.Client{Timeout: time.Second}, remixBackend: "clips-browser", throttle: &authThrottle{}}
	handler := (remixHost{auth: auth, backend: auth.remixBackend}).wrap(auth.protect(mux, strings.Repeat("t", 48)), mux)
	frontend := os.Getenv("CLIPS_REMIX_DIST")
	if !filepath.IsAbs(frontend) {
		t.Fatal("absolute frontend path required")
	}
	files := http.FileServer(http.Dir(frontend))
	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.Host)
		if host == "alfa.remix.localhost" || host == "copied.remix.localhost" {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self' "+hub+"; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; media-src 'self' blob:; img-src 'self' data: blob:")
			if r.URL.Path == "/clips-installation.json" {
				writeJSON(w, 200, map[string]string{"api_url": hub, "installation_id": installation.ID})
				return
			}
			if interfacePath(r.URL.Path) && !strings.HasPrefix(r.URL.Path, "/assets/") {
				http.ServeFile(w, r, filepath.Join(frontend, "index.html"))
				return
			}
			files.ServeHTTP(w, r)
			return
		}
		if host != "clips.hub.localhost" {
			w.WriteHeader(404)
			return
		}
		handler.ServeHTTP(w, r)
	})
	server.StartTLS()
	defer server.Close()
	done := make(chan struct{})
	go func() { defer close(done); runWorker(ctx, q) }()
	defer func() { cancel(); <-done }()
	stop := os.Getenv("CLIPS_REMIX_STOP")
	if !filepath.IsAbs(stop) {
		t.Fatal("absolute stop file required")
	}
	ready, _ := json.Marshal(map[string]any{"local_tls": server.URL, "hub": hub, "remix": front, "copied": copied, "installation": installation, "account_id": owner.ID})
	if err := os.WriteFile(stop+".ready", ready, 0600); err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(stop); err == nil {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}
