package sdrsdk

import (
	"context"
	"encoding/json"
	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func sampleContext(t *testing.T) Prepared {
	t.Helper()
	raw := json.RawMessage(`{"offers":[{"id":"essencial","amount_cents":49000,"setup_cents":149000}],"sources":[{"id":"catalogo"}],"facts":[]}`)
	c, e := BuildContext(Candidate{Organization: "alfa", Conversation: "conversation", Business: raw, InputIDs: []string{"m1"}, History: []HistoryMessage{{ID: "m1", Role: "user", Text: "Sou Ana, trabalho na Oficina Horizonte", Sequence: 1}}, At: time.Now()}, DefaultPolicy())
	if e != nil {
		t.Fatal(e)
	}
	return c
}
func TestWindowBoundsAndFactExpiry(t *testing.T) {
	p := DefaultPolicy()
	now := time.Now()
	if !p.Due(now, now.Add(29*time.Second)).Equal(now.Add(30 * time.Second)) {
		t.Fatal("unbounded grouping")
	}
	in := sampleContext(t).Candidate
	in.Memory = []Fact{{Key: "name", Value: "old", ExpiresAt: in.At.Add(-time.Second)}}
	out, e := BuildContext(in, p)
	if e != nil || len(out.Memory) != 0 {
		t.Fatal("expired memory")
	}
	in.InputIDs = []string{"missing"}
	if _, e = BuildContext(in, p); e != ErrOverflow {
		t.Fatal("missing pending input silently dropped")
	}
}
func TestDecisionGroundingAndBrazilianPrices(t *testing.T) {
	c := sampleContext(t)
	for _, price := range []string{"R$ 490", "R$ 490,00", "R$ 1.490", "R$ 1.490,00"} {
		d := Decision{Action: "reply", Message: price, KnowledgeIDs: []string{"essencial"}}
		if e := ValidateDecision(c, d); e != nil {
			t.Fatal("valid currency rejected", price)
		}
	}
	bad := []Decision{{Action: "reply", Message: "R$ 300"}, {Action: "book", Message: "Agendado"}, {Action: "reply", Message: "Sua reunião está confirmada"}, {Action: "reply", Message: "Olá", KnowledgeIDs: []string{"outro-tenant"}}, {Action: "reply", Message: "Oi", Facts: []ExtractedFact{{Key: "name", Value: "Pedro", MessageID: "m1"}}}}
	for i, d := range bad {
		if ValidateDecision(c, d) == nil {
			t.Fatal("ungrounded decision accepted", i)
		}
	}
	good := Decision{Action: "reply", Message: "Olá, Ana.", Facts: []ExtractedFact{{Key: "name", Value: "Ana", MessageID: "m1"}}}
	if ValidateDecision(c, good) != nil {
		t.Fatal("explicit fact rejected")
	}
}
func TestOpenAISDKKeepsContextLocalAndUsesStrictDecision(t *testing.T) {
	c := sampleContext(t)
	seen := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var b map[string]any
		json.NewDecoder(r.Body).Decode(&b)
		if b["store"] != false || b["previous_response_id"] != nil || b["model"] != "test-model" {
			t.Error("provider owns conversation state", b["store"])
		}
		input := b["input"].(string)
		if !strings.Contains(input, "Oficina Horizonte") || !strings.Contains(input, "amount_cents") {
			t.Error("canonical context not sent")
		}
		format := b["text"].(map[string]any)["format"].(map[string]any)
		if format["strict"] != true {
			t.Error("non-strict output")
		}
		seen = true
		d, _ := json.Marshal(Decision{Action: "reply", Message: "O plano custa R$ 490 por mês.", Facts: []ExtractedFact{{Key: "name", Value: "Ana", MessageID: "m1"}}, KnowledgeIDs: []string{"essencial"}})
		json.NewEncoder(w).Encode(map[string]any{"id": "response-test", "object": "response", "status": "completed", "output": []any{map[string]any{"type": "message", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": string(d)}}}}, "usage": map[string]any{"input_tokens": 100, "output_tokens": 30}})
	}))
	defer srv.Close()
	p := OpenAIPlanner{Client: openai.NewClient(option.WithAPIKey("test-only"), option.WithBaseURL(srv.URL+"/"), option.WithMaxRetries(0)), Model: "test-model"}
	o, e := p.Generate(context.Background(), c)
	if e != nil || !seen || o.ResponseID != "response-test" || o.InputTokens != 100 {
		t.Fatal("SDK adapter", e, o.ResponseID)
	}
}

func TestExplicitNameCorrectionStoresPositiveValueOnly(t *testing.T) {
	c := sampleContext(t)
	c.History = append(c.History, HistoryMessage{ID: "m2", Sequence: 2, Role: "user", Text: "Correção: meu nome é Beatriz, não Ana. A empresa continua sendo Oficina Horizonte e usamos planilhas."})
	d := Decision{Action: "reply", Message: "Certo, Beatriz.", Facts: []ExtractedFact{{Key: "name", Value: "meu nome é Beatriz, não Ana", MessageID: "m2"}, {Key: "company", Value: "a empresa continua sendo Oficina Horizonte", MessageID: "m2"}, {Key: "current_tool", Value: "usamos planilhas", MessageID: "m2"}}}
	d = CanonicalDecision(c, d)
	if d.Facts[0].Value != "Beatriz" || d.Facts[1].Value != "Oficina Horizonte" || d.Facts[2].Value != "planilhas" {
		t.Fatal("correction retained stale value", d.Facts)
	}
	if ValidateDecision(c, d) != nil {
		t.Fatal("canonical value lost evidence")
	}
}

func TestKnownToolIsNotAskedAgain(t *testing.T) {
	c := sampleContext(t)
	c.Memory = []Fact{{Key: "current_tool", Value: "planilhas"}}
	d := Decision{Action: "reply", Message: "Vocês usam só planilhas ou também WhatsApp e qual é a principal dificuldade?"}
	if QualityFeedback(c, d) == "" {
		t.Fatal("repeated tool question escaped review")
	}
	d.Message = "Qual é a principal dificuldade no acompanhamento dos contatos?"
	if QualityFeedback(c, d) != "" {
		t.Fatal("new question rejected")
	}
}
