package arkom

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestRejectOutsideArkomAndUnknownCapabilities(t *testing.T) {
	cases := []func(*Spec){func(s *Spec) { s.Backend = "python" }, func(s *Spec) { s.Deployment = "lovable" }, func(s *Spec) { s.CatalogVersion = "untrusted" }, func(s *Spec) { s.Reuses = []string{"finance.invented"} }, func(s *Spec) { s.RequiredFields = []string{"goal"} }, func(s *Spec) { s.RequiredFields = append(s.RequiredFields, "salary") }, func(s *Spec) { s.RequiredFields = append(s.RequiredFields, "company") }}
	for i, mutate := range cases {
		s := Default()
		mutate(&s)
		if s.Validate() == nil {
			t.Fatalf("case %d accepted", i)
		}
	}
}
func TestStrictReviewAndUnsupportedRequest(t *testing.T) {
	s := Default()
	raw, _ := json.Marshal(Review{Summary: "Coletar quantidade de vendedores", Change: &s})
	if _, err := ParseReview(string(raw)); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{string(raw) + " {}", `{"summary":"ok","change":null,"command":"rm -rf /"}`, "```json\n" + string(raw) + "\n```"} {
		if _, err := ParseReview(raw); err == nil {
			t.Fatal("untrusted syntax accepted")
		}
	}
	r, err := ParseReview(`{"summary":"Pagamento não está neste recorte","change":null}`)
	if err != nil || r.Change != nil {
		t.Fatal("unsupported request should remain a plan")
	}
}
func TestBuildQuotesModelContentAndChecksEveryField(t *testing.T) {
	s := Default()
	s.RequiredFields = append(s.RequiredFields, "sellers")
	s.Title = `Contato "); panic("injection") //`
	a, err := Build(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	if !a.Verified || len(a.Digest) != 64 || !strings.Contains(a.Tests, "missing evidence accepted") {
		t.Fatal("missing build evidence")
	}
	if len(s.Missing(map[string]string{"company": "A", "goal": "B", "sellers": " "})) != 1 {
		t.Fatal("blank evidence accepted")
	}
}
