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

func TestCalendarIntentRequiresOwnOffersPermissionsAndExplicitChoice(t *testing.T) {
	c := sampleContext(t)
	c.At = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	c.History = []HistoryMessage{{ID: "choice", Role: "user", Text: "Quero a opção 1"}}
	c.InputIDs = []string{"choice"}
	slot := CalendarSlot{ID: "actual-slot", CalendarID: "allowed", Timezone: "America/Cuiaba", Start: c.At.Add(time.Hour), End: c.At.Add(90 * time.Minute)}
	hints := map[string]any{"organization_id": c.Organization, "calendars": []map[string]any{{"id": "allowed", "permissions": CalendarGrant{Read: true, Book: true}}}, "offers": []map[string]any{{"availability_id": "actual-offer", "slots": []CalendarSlot{slot}}}}
	c.Calendar, _ = json.Marshal(hints)
	intent := &CalendarIntent{Kind: "book", AvailabilityID: "actual-offer", SlotID: "actual-slot", EvidenceMessageID: "choice"}
	if e := ValidateCalendarIntent(c, intent); e != nil {
		t.Fatal(e)
	}
	intent.SlotID = "invented"
	if ValidateCalendarIntent(c, intent) == nil {
		t.Fatal("invented slot accepted")
	}
	intent.SlotID = "actual-slot"
	c.History[0].Text = "Essa opção é grátis?"
	if ValidateCalendarIntent(c, intent) == nil {
		t.Fatal("question treated as consent")
	}
	c.History[0].Text = "não quero a opção 1"
	if ValidateCalendarIntent(c, intent) == nil {
		t.Fatal("negative treated as consent")
	}
	hints["organization_id"] = "other-company"
	c.Calendar, _ = json.Marshal(hints)
	if ValidateCalendarIntent(c, intent) == nil {
		t.Fatal("foreign calendar context accepted")
	}
}

func TestCalendarOpenAIContractIsStrictNullableAndUsesOurContext(t *testing.T) {
	c := sampleContext(t)
	c.At = time.Now().UTC()
	c.History = []HistoryMessage{{ID: "calendar-question", Role: "user", Text: "Quero consultar horários"}}
	c.InputIDs = []string{"calendar-question"}
	c.Calendar, _ = json.Marshal(map[string]any{"organization_id": c.Organization, "calendars": []map[string]any{{"id": "allowed", "permissions": CalendarGrant{Read: true}}}})
	seen := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = true
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["store"] != false || body["previous_response_id"] != nil {
			t.Fatal("provider owns agenda context")
		}
		if strings.Contains(body["instructions"].(string), "Não há ferramenta de agenda") {
			t.Fatal("calendar prompt was not enabled")
		}
		format := body["text"].(map[string]any)["format"].(map[string]any)
		schema := format["schema"].(map[string]any)
		if format["strict"] != true || schema["properties"].(map[string]any)["calendar"] == nil {
			t.Fatal("strict agenda schema missing")
		}
		decision := Decision{Action: "reply", Message: "Vou consultar os horários.", Calendar: &CalendarIntent{Kind: "availability", CalendarIDs: []string{"allowed"}, Mode: "any", From: c.At.Add(time.Hour).Format(time.RFC3339), To: c.At.Add(2 * time.Hour).Format(time.RFC3339), Duration: 30, EvidenceMessageID: c.InputIDs[0]}}
		raw, _ := json.Marshal(decision)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "calendar-response", "object": "response", "status": "completed", "output": []any{map[string]any{"type": "message", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": string(raw)}}}}, "usage": map[string]any{"input_tokens": 10, "output_tokens": 10}})
	}))
	defer server.Close()
	p := OpenAIPlanner{Client: openai.NewClient(option.WithAPIKey("unit-test-only"), option.WithBaseURL(server.URL+"/"), option.WithMaxRetries(0)), Model: "test-model"}
	out, e := p.Generate(context.Background(), c)
	if e != nil || !seen || out.Decision.Calendar == nil || out.Decision.Calendar.Kind != "availability" {
		t.Fatal("calendar model contract", e)
	}
}
