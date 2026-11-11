package integration

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/httpapi"
)

func TestClickMaxStageHandoffOneOpeningAcrossAttempts(t *testing.T) {
	db := setup(t)
	ctx := context.Background()
	const cardID = "11111111-1111-4111-8111-111111111111"
	const contactID = "22222222-2222-4222-8222-222222222222"
	const botID = "33333333-3333-4333-8333-333333333333"
	const pipelineID = "44444444-4444-4444-8444-444444444444"
	stages := map[string]string{"contact_pending": "55555555-5555-4555-8555-555555555555", "contacted": "66666666-6666-4666-8666-666666666666", "attempt_2": "77777777-7777-4777-8777-777777777777", "attempt_3": "88888888-8888-4888-8888-888888888888", "no_show": "99999999-9999-4999-8999-999999999999"}
	card := clickmax.Card{ID: cardID, PipelineID: pipelineID, StageID: stages["contact_pending"], Status: "open", LeadIDs: []string{contactID}, ResponsibleAttendantID: botID}
	var contact clickmax.Contact
	contact.ID, contact.Name, contact.Phone = contactID, "Ana", "5565999999999"
	yes := true
	contact.MessagePreferences.WhatsApp = &yes
	tagAvailable := false
	client, _ := clickmax.New("cxd_pipelineintaketestkey")
	client.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		var data any
		switch r.URL.Path {
		case "/api/v0/tags/apply-to-leads":
			if !tagAvailable {
				return &http.Response{StatusCode: 503, Body: io.NopCloser(strings.NewReader(`{}`)), Request: r}, nil
			}
			data = map[string]int{"applied": 1}
		case "/api/v0/cards/get":
			data = card
		case "/api/v0/leads/get":
			data = contact
		default:
			t.Fatalf("unexpected ClickMax request %s", r.URL)
		}
		raw, _ := json.Marshal(data)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(raw))), Request: r}, nil
	})
	key := strings.Repeat("k", 48)
	server := &httpapi.Server{DB: db, ClickMax: client, ClickMaxPipeline: pipelineID, ClickMaxStages: stages, ClickMaxBiaAttendant: botID, IntakeToken: key, VoiceSender: voiceSender, Mode: "live", FormAutoContact: true}
	h := server.Handler()
	post := func(stage string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"clickmax_card_id": cardID, "clickmax_contact_id": contactID, "clickmax_stage_id": stage})
		r := httptest.NewRequest("POST", "/webhooks/bia/leads", strings.NewReader(string(body)))
		r.Header.Set("Authorization", "Bearer "+key)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	expectIgnored := func(reason string) {
		t.Helper()
		w := post(card.StageID)
		if w.Code != 202 || !strings.Contains(w.Body.String(), reason) {
			t.Fatalf("expected %s: %d %s", reason, w.Code, w.Body)
		}
	}
	card.ResponsibleAttendantID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	expectIgnored("human_assignee")
	card.CreatedAt = time.Now()
	yes = false
	expectIgnored("whatsapp_not_authorized") // fresh seller assignment reached the consent check
	card.CreatedAt = time.Time{}
	yes = true
	card.ResponsibleAttendantID = botID
	yes = false
	expectIgnored("whatsapp_not_authorized")
	yes = true
	contact.Tags = append(contact.Tags, struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}{Name: "optout-whatsapp"})
	expectIgnored("whatsapp_opted_out")
	contact.Tags = nil
	if w := post(stages["attempt_2"]); w.Code != 202 || !strings.Contains(w.Body.String(), "card_changed_or_not_eligible") {
		t.Fatalf("accepted stale event %d %s", w.Code, w.Body)
	}
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 12)
	for range cap(responses) {
		wg.Add(1)
		go func() { defer wg.Done(); responses <- post(card.StageID) }()
	}
	wg.Wait()
	close(responses)
	first := 0
	for w := range responses {
		if w.Code != 202 {
			t.Fatalf("intake %d %s", w.Code, w.Body)
		}
		if strings.Contains(w.Body.String(), `"duplicate":false`) {
			first++
		}
	}
	if first != 1 {
		t.Fatalf("parallel first contacts: %d", first)
	}
	m := &countingMessenger{}
	w := runtimeWorker(db, time.Now(), m)
	drain(t, w)
	for _, name := range []string{"contacted", "attempt_2", "attempt_3", "no_show"} {
		card.StageID = stages[name]
		r := post(card.StageID)
		if r.Code != 202 || !strings.Contains(r.Body.String(), `"duplicate":true`) {
			t.Fatalf("stage %s restarted opening: %d %s", name, r.Code, r.Body)
		}
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE payload->>'purpose'='form_contact'`); err != nil {
		t.Fatal(err)
	}
	drain(t, w)
	if m.Count.Load() != 1 {
		t.Fatalf("expected one opening, got %d", m.Count.Load())
	}
	var bindings, events int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.clickmax_cards`).Scan(&bindings); err != nil || bindings != 1 {
		t.Fatalf("bindings %d %v", bindings, err)
	}
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM bia_go.jobs WHERE id LIKE 'bia-intake-clickmax-card-%'`).Scan(&events); err != nil || events != 1 {
		t.Fatalf("events %d %v", events, err)
	}
	state, err := db.Lead(ctx, domain.LeadKey("+5565999999999"))
	if err != nil || state.Profile.ProviderLeadID != contactID {
		t.Fatalf("contact identity lost: %v", err)
	}
	server.ClickMaxGoTag = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	if r := post(card.StageID); r.Code != 503 || !strings.Contains(r.Body.String(), "clickmax_ownership_marker_pending") {
		t.Fatalf("marker failure was not retryable: %d %s", r.Code, r.Body)
	}
	tagAvailable = true
	if r := post(card.StageID); r.Code != 202 || !strings.Contains(r.Body.String(), `"duplicate":true`) {
		t.Fatalf("marker repair restarted intake: %d %s", r.Code, r.Body)
	}
	drain(t, w)
	if m.Count.Load() != 1 {
		t.Fatal("marker retry sent a second opening")
	}
}
