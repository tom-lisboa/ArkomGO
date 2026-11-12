package main

import (
	"encoding/json"
	"github.com/openai/openai-go/v3/responses"
	"testing"
)

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
