package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMultipropriedadesSessionRequiresTheBoundLocalIdentity(t *testing.T) {
	a, creds, _ := genesisApp(t)
	admin := login(t, a, creds, "alfa.admin")
	operator := login(t, a, creds, "beta.operator")
	t.Setenv("ARKOM_MULTI_STATE_DIR", t.TempDir())

	for _, test := range []struct {
		name, token, peer string
		want              int
	}{
		{"without session", "", "127.0.0.1:1234", 401},
		{"without product access", operator, "127.0.0.1:1234", 403},
		{"without loopback", admin, "192.0.2.1:1234", 404},
		{"without local account credentials", admin, "127.0.0.1:1234", 503},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/v1/sdr/genesis-demo/ecosystem/multipropriedades/session",
				bytes.NewBufferString(`{"organization_id":"org_demo_alfa","role":"admin"}`))
			r.RemoteAddr = test.peer
			if test.token != "" {
				r.Header.Set("Authorization", "Bearer "+test.token)
			}
			w := httptest.NewRecorder()
			a.Handler().ServeHTTP(w, r)
			if w.Code != test.want {
				t.Fatalf("status %d, want %d", w.Code, test.want)
			}
		})
	}
}
