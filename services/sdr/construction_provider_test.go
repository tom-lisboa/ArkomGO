package main

import (
	"context"
	"deeph/pkg/construction"
	"encoding/json"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConstructionModelConfiguration(t *testing.T) {
	t.Setenv("SDR_OPENAI_MODEL", "customer-sdr-model")
	p, err := newConstructionProvider("test-key", "", "")
	if err != nil || p.planner.Model != "gpt-6.1-sol" || p.effort != "high" {
		t.Fatalf("unexpected default provider: %+v, %v", p, err)
	}
	p, err = newConstructionProvider("test-key", " gpt-6.1-sol ", " medium ")
	if err != nil || p.planner.Model != "gpt-6.1-sol" || p.effort != "medium" {
		t.Fatalf("explicit configuration not respected: %+v, %v", p, err)
	}
	for _, effort := range []string{"none", "typo"} {
		if _, err := newConstructionProvider("test-key", "", effort); err == nil {
			t.Fatalf("invalid effort %q accepted", effort)
		}
	}
	if _, err := newConstructionProvider("", "", ""); err == nil {
		t.Fatal("missing credential accepted")
	}
}

func TestConstructionSolResponsesContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/responses" {
			t.Errorf("unexpected endpoint: %s %s", r.Method, r.URL.Path)
		}
		var body struct {
			Model           string `json:"model"`
			Store           bool   `json:"store"`
			MaxOutputTokens int    `json:"max_output_tokens"`
			Reasoning       struct {
				Effort string `json:"effort"`
			} `json:"reasoning"`
			Text struct {
				Format struct {
					Type   string `json:"type"`
					Strict bool   `json:"strict"`
				} `json:"format"`
			} `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Model != "gpt-6.1-sol" || body.Reasoning.Effort != "high" || body.MaxOutputTokens != 32000 || body.Store || body.Text.Format.Type != "json_schema" || !body.Text.Format.Strict {
			t.Errorf("unexpected Responses contract: %+v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"completed","output":[{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"{\"summary\":\"Revisado\",\"actions\":[],\"verdict\":\"ready\"}"}]}]}`))
	}))
	defer server.Close()
	p, err := newConstructionProvider("test-key", "", "")
	if err != nil {
		t.Fatal(err)
	}
	p.planner.Client = openai.NewClient(option.WithAPIKey("test-key"), option.WithBaseURL(server.URL+"/"), option.WithMaxRetries(0))
	turn, err := p.Next(context.Background(), construction.Request{Instruction: "Review the solution."})
	if err != nil || turn.Verdict != "ready" {
		t.Fatalf("unexpected result: %+v, %v", turn, err)
	}
}

func TestConstructionIgnoresCommentaryActions(t *testing.T) {
	action := `{"summary":"Arquivo pronto","actions":[{"tool":"write","path":"backend/main.go","content":"package main"}],"verdict":"continue"}`
	message := func(phase, text string) map[string]any {
		return map[string]any{"type": "message", "role": "assistant", "phase": phase, "content": []any{map[string]any{"type": "output_text", "text": text}}}
	}
	parse := func(status string, items ...any) (int, error) {
		raw, _ := json.Marshal(map[string]any{"status": status, "output": items})
		var response responses.Response
		if err := json.Unmarshal(raw, &response); err != nil {
			t.Fatal(err)
		}
		turn, err := parseConstructionResponse(response)
		return len(turn.Actions), err
	}
	if n, err := parse("completed", message("commentary", `{"actions":[{"tool":"write","path":"wrong"}]}`), message("final_answer", action)); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if n, err := parse("completed", message("", action)); err != nil || n != 1 {
		t.Fatal("legacy response", n, err)
	}
	for _, items := range [][]any{{message("commentary", action)}, {message("final_answer", action), message("final_answer", action)}, {message("final_answer", action+action)}} {
		if _, err := parse("completed", items...); err == nil {
			t.Fatal("ambiguous or intermediate actions accepted")
		}
	}
	if _, err := parse("incomplete", message("final_answer", action)); err == nil {
		t.Fatal("incomplete accepted")
	}
}
