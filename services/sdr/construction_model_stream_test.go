package main

import (
	"context"
	"deeph/pkg/construction"
	"encoding/json"
	"fmt"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"net/http"
	"net/http/httptest"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func TestConstructionStreamEmitsOnlyCompleteActionsAcrossEscapes(t *testing.T) {
	source := "<script>let x = '{\"actions\":[{';</script><h1>Primeira seção</h1>"
	turn := construction.Turn{Summary: "Criando a abertura", Actions: []construction.Action{{Tool: "write", Path: "frontend/src/App.svelte", Content: source}, {Tool: "write", Path: "frontend/src/theme.css", Content: "body{color:red}"}}, Verdict: "continue"}
	raw, _ := json.Marshal(turn)
	var actions []construction.Action
	generating := 0
	parser := constructionStreamParser{emit: func(p construction.Progress) error {
		if p.Path != "" {
			generating++
		}
		if p.Action != nil {
			actions = append(actions, *p.Action)
		}
		return nil
	}}
	firstEnd := strings.Index(string(raw), `},{`) + 1
	if firstEnd < 1 {
		t.Fatal("fixture")
	}
	for i := 0; i < firstEnd; i++ {
		if err := parser.feed(string(raw[i : i+1])); err != nil {
			t.Fatal(err)
		}
	}
	if len(actions) != 1 || actions[0].Content != source || generating != 1 {
		t.Fatal("first action not available before the second is generated", actions, generating)
	}
	if err := parser.feed(string(raw[firstEnd:])); err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || parser.summary != turn.Summary {
		t.Fatal("lost or replayed actions", actions)
	}
	if err := parser.feed(""); err != nil || len(actions) != 2 {
		t.Fatal("replayed chunk")
	}
}
func TestConstructionStreamDoesNotApplyTruncatedFile(t *testing.T) {
	called := false
	parser := constructionStreamParser{emit: func(p construction.Progress) error {
		if p.Action != nil {
			called = true
		}
		return nil
	}}
	if err := parser.feed(`{"actions":[{"tool":"write","path":"frontend/src/App.svelte","content":"<h1>unfinished`); err != nil || called {
		t.Fatal("partial source was committed", err)
	}
}

func TestConstructionModelStreamExecutesFinalActionBeforeResponseCompletes(t *testing.T) {
	action := construction.Action{Tool: "write", Path: "frontend/src/App.svelte", Content: "<h1>Aparece agora</h1>"}
	rawAction, _ := json.Marshal(action)
	prefix := `{"actions":[` + string(rawAction) + `]`
	suffix := `,"summary":"A primeira seção está pronta","verdict":"continue"}`
	applied := make(chan struct{})
	complete := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		send := func(kind string, data map[string]any) {
			data["type"] = kind
			body, _ := json.Marshal(data)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", kind, body)
			w.(http.Flusher).Flush()
		}
		send("response.output_item.added", map[string]any{"output_index": 0, "item": map[string]any{"type": "message", "role": "assistant", "phase": "commentary"}})
		send("response.output_text.delta", map[string]any{"output_index": 0, "delta": prefix + suffix})
		send("response.output_item.added", map[string]any{"output_index": 1, "item": map[string]any{"type": "message", "role": "assistant", "phase": "final_answer"}})
		send("response.output_text.delta", map[string]any{"output_index": 1, "delta": prefix})
		select {
		case <-applied:
		case <-time.After(2 * time.Second):
			t.Error("action waited for full response")
			return
		}
		complete = true
		send("response.output_text.delta", map[string]any{"output_index": 1, "delta": suffix})
		send("response.completed", map[string]any{"response": map[string]any{"status": "completed", "output": []any{map[string]any{"type": "message", "role": "assistant", "phase": "commentary", "content": []any{map[string]any{"type": "output_text", "text": prefix + suffix}}}, map[string]any{"type": "message", "role": "assistant", "phase": "final_answer", "content": []any{map[string]any{"type": "output_text", "text": prefix + suffix}}}}}})
	}))
	defer server.Close()
	client := openai.NewClient(option.WithBaseURL(server.URL+"/"), option.WithAPIKey("test"), option.WithMaxRetries(0))
	provider := constructionProvider{planner: &sdrsdk.OpenAIPlanner{Client: client, Model: "test-model"}}
	count := 0
	turn, err := provider.NextProgressive(context.Background(), construction.Request{Agent: "interface"}, func(p construction.Progress) error {
		if p.Action != nil {
			count++
			if complete {
				t.Error("action only appeared after completion")
			}
			close(applied)
		}
		return nil
	})
	if err != nil || count != 1 || len(turn.Actions) != 1 || turn.Actions[0] != action {
		t.Fatal(err, count, turn)
	}
}
