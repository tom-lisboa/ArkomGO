package main

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

type ecosystemTransport func(*http.Request) (*http.Response, error)

func (f ecosystemTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestEcosystemCatalogAndPrivateClipsBridge(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	base := "/v1/sdr/genesis-demo/ecosystem"
	if code, _ := req(a, "GET", base, "", "", nil); code != 401 {
		t.Fatal(code)
	}
	code, out := req(a, "GET", base, admin, "", nil)
	if code != 200 {
		t.Fatal(code)
	}
	count := 0
	for _, raw := range out["solutions"].([]any) {
		s := raw.(map[string]any)
		if s["implemented"] == true {
			count++
		}
		if s["id"] == "financeai" && s["implemented"] != false {
			t.Fatal("unimplemented service unlocked")
		}
	}
	if count != 4 {
		t.Fatal("incorrect operational catalog", count)
	}
	t.Setenv("SDR_CLIPS_BRIDGE_KEY", strings.Repeat("a", 48))
	prior := ecosystemClient
	defer func() { ecosystemClient = prior }()
	owners := []string{}
	ecosystemClient = &http.Client{Transport: ecosystemTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "127.0.0.1:18082" || r.Header.Get("Authorization") != "" {
			t.Fatal("unsafe upstream request")
		}
		cookie, err := r.Cookie("clips_go")
		if err != nil || len(cookie.Value) != 26 {
			t.Fatal("missing tenant identity")
		}
		owners = append(owners, cookie.Value)
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}, "Set-Cookie": []string{"never=expose"}}, Body: io.NopCloser(strings.NewReader(`{"jobs":[]}`))}, nil
	})}
	for _, token := range []string{admin, beta, admin} {
		if code, _ := req(a, "GET", base+"/clips/jobs", token, "", nil); code != 200 {
			t.Fatal(code)
		}
	}
	if owners[0] == owners[1] || owners[0] != owners[2] {
		t.Fatal("tenant separation or stability lost")
	}
	if code, _ := req(a, "POST", base+"/clips/jobs", viewer, "", nil); code != 403 {
		t.Fatal("viewer upload", code)
	}
	if code, _ := req(a, "GET", base+"/clips/other", admin, "", nil); code != 404 {
		t.Fatal("unknown route forwarded", code)
	}
}
