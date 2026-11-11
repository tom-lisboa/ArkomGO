package followupworker

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
)

type commercialTransport func(*http.Request) (*http.Response, error)

func (f commercialTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestFollowupRechecksCurrentCommercialCard(t *testing.T) {
	const contact = "12345678-1234-4234-8234-123456789abc"
	status, stage := "open", "scheduled"
	client, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	client.HTTP.Transport = commercialTransport(func(r *http.Request) (*http.Response, error) {
		var body string
		switch {
		case strings.HasSuffix(r.URL.Path, "/pipelines/list"):
			body = `{"data":[{"stagesBreakdown":[{"stageId":"sales","stageName":"Realizada/Negociação"}]}]}`
		case strings.HasSuffix(r.URL.Path, "/cards/list-by-lead") && r.URL.Query().Get("leadId") == contact:
			body = fmt.Sprintf(`{"data":[{"status":%q,"stageId":%q}]}`, status, stage)
		default:
			t.Fatal("unexpected lookup", r.URL.Path)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	w := &Worker{}
	w.ProtectCommercialStages(nil, client)
	s := domain.State{Profile: domain.Form{ProviderLeadID: contact}}
	fx := domain.Effect{Purpose: "recovery"}
	for _, tc := range []struct{ status, stage, reason string }{
		{"open", "scheduled", ""},
		{"open", "sales", "crm_commercial_stage"},
		{"won", "scheduled", "crm_commercial_stage"},
	} {
		status, stage = tc.status, tc.stage
		if got, err := w.runtime.OutreachGuard(context.Background(), s, fx); err != nil || got != tc.reason {
			t.Fatalf("status=%s stage=%s: got %q, %v", status, stage, got, err)
		}
	}
}
