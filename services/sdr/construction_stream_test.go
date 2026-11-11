package main

import (
	"bufio"
	"context"
	"deeph/pkg/construction"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestConstructionStreamPushReplayAndIsolation(t *testing.T) {
	a, c, _ := genesisApp(t)
	admin := login(t, a, c, "alfa.admin")
	beta := login(t, a, c, "beta.admin")
	a.state.Platform.Constructions = map[string]*ConstructionBuild{"stream": {ID: "stream", Org: "org_demo_alfa", Goal: "New app", Status: "running", Files: construction.Seed()}}
	server := httptest.NewServer(a.Handler())
	defer server.Close()
	path := "/v1/sdr/genesis-demo/construction/stream/events"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	get := func(key, suffix string) *http.Response {
		req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+path+suffix, nil)
		req.Header.Set("Authorization", "Bearer "+key)
		r, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	denied := get(beta, "")
	if denied.StatusCode != 404 {
		t.Fatal("cross tenant stream")
	}
	denied.Body.Close()
	invalid := get(admin, "?after=nope")
	if invalid.StatusCode != 400 {
		t.Fatal("cursor")
	}
	invalid.Body.Close()
	r := get(admin, "")
	defer r.Body.Close()
	if r.StatusCode != 200 || !strings.Contains(r.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatal(r.StatusCode)
	}
	reader := bufio.NewReader(r.Body)
	frame := func(reader *bufio.Reader) (string, map[string]any) {
		kind := ""
		var data map[string]any
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				t.Fatal(err)
			}
			if strings.HasPrefix(line, "event: ") {
				kind = strings.TrimSpace(strings.TrimPrefix(line, "event: "))
			}
			if strings.HasPrefix(line, "data: ") {
				if err = json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &data); err != nil {
					t.Fatal(err)
				}
			}
			if line == "\n" && data != nil {
				return kind, data
			}
		}
	}
	kind, data := frame(reader)
	if kind != "snapshot" || data["files"] == nil {
		t.Fatal(kind, data)
	}
	if err := a.constructionTrace("stream", construction.Event{Kind: "file.written", Path: "backend/push.go", After: "package push", Agent: "backend", Summary: "Saved"}); err != nil {
		t.Fatal(err)
	}
	kind, data = frame(reader)
	if kind != "update" || len(data["traces"].([]any)) != 1 {
		t.Fatal("live push", kind, data)
	}
	replay := get(admin, "?after=1")
	_, data = frame(bufio.NewReader(replay.Body))
	replay.Body.Close()
	if len(data["traces"].([]any)) != 0 || data["files"].(map[string]any)["backend/push.go"] != "package push" {
		t.Fatal("cursor replay", data)
	}
	a.mu.Lock()
	a.failSave = true
	a.mu.Unlock()
	if err := a.constructionTrace("stream", construction.Event{Kind: "file.written", Path: "backend/failed.go", After: "bad"}); err == nil {
		t.Fatal("failed commit")
	}
	a.mu.Lock()
	a.failSave = false
	a.mu.Unlock()
	if code, _ := req(a, "POST", "/v1/sdr/genesis-demo/construction/stream/cancel", admin, "", nil); code != 200 {
		t.Fatal(code)
	}
	_, data = frame(reader)
	if data["build"].(map[string]any)["status"] != "cancelled" {
		t.Fatal(data)
	}
	kind, _ = frame(reader)
	if kind != "end" {
		t.Fatal(kind)
	}
}
