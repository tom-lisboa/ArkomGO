package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
)

func TestClickMaxLinksVerifiedCardAndReconcilesLostMove(t *testing.T) {
	db := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	panel := newPanel(t, db, now, "admin")
	client, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	const pipeline = "11111111-1111-4111-8111-111111111111"
	const cardID = "22222222-2222-4222-8222-222222222222"
	const contact = "33333333-3333-4333-8333-333333333333"
	const initial = "44444444-4444-4444-8444-444444444444"
	const booked = "55555555-5555-4555-8555-555555555555"
	const confirmed = "66666666-6666-4666-8666-666666666666"
	const manual = "77777777-7777-4777-8777-777777777777"
	var mu sync.Mutex
	stage, moves := initial, 0
	client.HTTP.Transport = googleTransport(func(req *http.Request) (*http.Response, error) {
		mu.Lock()
		defer mu.Unlock()
		if req.URL.Host != "mcp.clickmax.io" || req.Header.Get("Authorization") != "Bearer cxd_disposabletestkey" {
			t.Error("unexpected provider or authentication")
			return nil, io.ErrUnexpectedEOF
		}
		var body any
		switch req.URL.Path {
		case "/api/v0/pipelines/list":
			body = map[string]any{"data": []any{map[string]any{"id": pipeline, "name": "Pipeline Bia de teste", "stagesBreakdown": []any{map[string]any{"stageId": booked, "stageName": "Agendado"}, map[string]any{"stageId": confirmed, "stageName": "Presença confirmada"}}}}}
		case "/api/v0/cards/get":
			if req.URL.Query().Get("cardId") != cardID {
				t.Error("wrong card")
			}
			body = clickmax.Card{ID: cardID, PipelineID: pipeline, StageID: stage, Status: "open", LeadIDs: []string{contact}}
		case "/api/v0/leads/get":
			if req.URL.Query().Get("leadId") != contact {
				t.Error("wrong contact")
			}
			body = clickmax.Contact{ID: contact, Phone: "5565999991234"}
		case "/api/v0/cards/move":
			var move map[string]string
			if json.NewDecoder(req.Body).Decode(&move) != nil || move["id"] != cardID || move["stageId"] != booked {
				t.Error("unexpected stage move")
				return nil, io.ErrUnexpectedEOF
			}
			stage = booked
			moves++
			return nil, io.ErrUnexpectedEOF
		default:
			t.Error("unexpected ClickMax operation", req.URL.Path)
			return nil, io.ErrUnexpectedEOF
		}
		raw, _ := json.Marshal(body)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Header: http.Header{"Content-Type": {"application/json"}}, Request: req}, nil
	})
	panel.s.ClickMax = client
	panel.s.ClickMaxSync = true
	panel.s.ClickMaxSettings = clickmax.Settings{PipelineID: pipeline, Stages: map[string]string{"booked": booked, "presence_confirmed": confirmed}}
	lead := testState("clickmax-lead", now)
	lead.Profile.Phone = "+5565999991234"
	lead.Human = true
	lead.Booking = &domain.Booking{ID: "verified-booking", Start: now.Add(time.Hour), End: now.Add(105 * time.Minute)}
	publishEffects(t, db, "clickmax-lead", lead)
	other := testState("clickmax-other", now)
	other.Profile.Phone = "+5565999999876"
	publishEffects(t, db, "clickmax-other", other)
	if out := panelCall(t, panel, "PUT", "/leads/"+other.ID+"/integrations/clickmax", map[string]string{"card_id": cardID}, ""); out.Code != 409 {
		t.Fatal("linked unrelated lead", out.Code, out.Body)
	}
	path := "/leads/" + lead.ID + "/integrations/clickmax"
	if out := panelCall(t, panel, "PUT", path, map[string]string{"card_id": cardID}, ""); out.Code != 200 {
		t.Fatal(out.Code, out.Body)
	}
	finished := make(chan struct{})
	go func() { defer close(finished); panel.s.RunClickMax(ctx) }()
	defer func() { cancel(); <-finished }()
	// Let the worker complete a poll while a human is handling this lead.
	time.Sleep(2200 * time.Millisecond)
	mu.Lock()
	movedDuringHandoff := moves != 0
	mu.Unlock()
	if movedDuringHandoff {
		t.Fatal("moved a card while a human was handling the lead")
	}
	lead.Human = false
	raw, _ := json.Marshal(lead)
	if _, err = db.Pool.Exec(ctx, `UPDATE bia_go.leads SET state=$2 WHERE id=$1`, lead.ID, raw); err != nil {
		t.Fatal(err)
	}
	await := func(want func(string, string, bool) bool) {
		t.Helper()
		deadline := time.Now().Add(6 * time.Second)
		for time.Now().Before(deadline) {
			var current, code string
			var paused bool
			if err := db.Pool.QueryRow(ctx, `SELECT confirmed_stage::text,error_code,paused FROM bia_go.clickmax_cards WHERE lead_id=$1`, lead.ID).Scan(&current, &code, &paused); err != nil {
				t.Fatal(err)
			}
			if want(current, code, paused) {
				return
			}
			time.Sleep(25 * time.Millisecond)
		}
		t.Fatal("ClickMax binding did not reach expected state")
	}
	await(func(stage, code string, _ bool) bool { return stage == initial && code == "clickmax_unavailable" })
	if _, err = db.Pool.Exec(ctx, `UPDATE bia_go.clickmax_cards SET next_attempt_at=now() WHERE lead_id=$1`, lead.ID); err != nil {
		t.Fatal(err)
	}
	await(func(stage, code string, _ bool) bool { return stage == booked && code == "" })
	mu.Lock()
	if moves != 1 {
		mu.Unlock()
		t.Fatal("duplicate stage move", moves)
	}
	stage = manual
	mu.Unlock()
	lead.Booking.ConfirmedAt = &now
	raw, _ = json.Marshal(lead)
	if _, err = db.Pool.Exec(ctx, `UPDATE bia_go.leads SET state=$2 WHERE id=$1`, lead.ID, raw); err != nil {
		t.Fatal(err)
	}
	await(func(_ string, code string, paused bool) bool {
		return paused && code == "clickmax_card_changed_externally"
	})
	mu.Lock()
	defer mu.Unlock()
	if moves != 1 || stage != manual {
		t.Fatal("overrode manual ClickMax stage")
	}
}

func TestClickMaxIntakeCreatesOnceAndMovesBookedCardAfterMeetingFields(t *testing.T) {
	db := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	now := time.Now().UTC()
	panel := newPanel(t, db, now, "admin")
	panel.s.Policy.TimeZone = "America/Cuiaba"
	const pipeline = "11111111-1111-4111-8111-111111111111"
	const cardID = "22222222-2222-4222-8222-222222222222"
	const contact = "33333333-3333-4333-8333-333333333333"
	const initial = "44444444-4444-4444-8444-444444444444"
	const booked = "55555555-5555-4555-8555-555555555555"
	const dateField = "66666666-6666-4666-8666-666666666666"
	const timeField = "77777777-7777-4777-8777-777777777777"
	lead := testState("clickmax-new-lead", now.Add(-30*time.Second))
	start := time.Date(2027, 4, 9, 1, 45, 0, 0, time.UTC)
	lead.Booking = &domain.Booking{ID: "booking", Start: start, End: start.Add(45 * time.Minute)}
	publishEffects(t, db, "clickmax-new-lead", lead)
	past := testState("clickmax-preexisting", now.Add(-time.Hour))
	past.Profile.Phone = "+5565999991234"
	publishEffects(t, db, "clickmax-preexisting", past)
	client, err := clickmax.New("cxd_disposabletestkey")
	if err != nil {
		t.Fatal(err)
	}
	creates, moves := 0, 0
	fields := map[string]string{}
	card := clickmax.Card{}
	client.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		var body any
		switch r.URL.Path {
		case "/api/v0/pipelines/list":
			body = map[string]any{"data": []any{map[string]any{
				"id": pipeline, "name": "SDR", "stagesBreakdown": []any{
					map[string]any{"stageId": initial, "displayOrder": 0},
					map[string]any{"stageId": booked, "displayOrder": 7},
				},
			}}}
		case "/api/v0/leads/search":
			var input struct {
				Filters []struct{ ValueString string }
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil || len(input.Filters) != 1 || !strings.HasSuffix(lead.Profile.Phone, input.Filters[0].ValueString) {
				t.Error("searched for an unrelated lead")
			}
			body = map[string]any{"data": []clickmax.Contact{{ID: contact, Phone: lead.Profile.Phone}}, "meta": map[string]int{"countItens": 1}}
		case "/api/v0/cards/list-by-lead":
			if r.URL.Query().Get("leadId") != contact {
				t.Error("wrong contact")
			}
			cards := []clickmax.Card{}
			if card.ID != "" {
				cards = append(cards, card)
			}
			body = map[string]any{"data": cards}
		case "/api/v0/cards/create":
			var input clickmax.Card
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.StageID != initial || input.PipelineID != pipeline || len(input.LeadIDs) != 1 || input.LeadIDs[0] != contact {
				t.Error("card created outside the configured scope")
			}
			creates++
			card = clickmax.Card{ID: cardID, PipelineID: pipeline, StageID: initial, Status: "open", LeadIDs: []string{contact}}
			return nil, io.ErrUnexpectedEOF
		case "/api/v0/cards/get":
			body = card
		case "/api/v0/opportunities/bulk-set-custom-field":
			var input struct {
				CardIDs              []string
				CustomFieldID, Value string
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil || len(input.CardIDs) != 1 || input.CardIDs[0] != cardID {
				t.Error("field update applied outside the linked card")
			}
			fields[input.CustomFieldID] = input.Value
			body = map[string]any{"mode": "sync", "affected": 1}
		case "/api/v0/cards/move":
			var input clickmax.Card
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.ID != cardID || input.StageID != booked || fields[dateField] != "2027-04-08" || fields[timeField] != "21:45" {
				t.Error("move missing verified meeting date and time")
			}
			moves++
			card.StageID = booked
			body = card
		default:
			t.Errorf("unexpected API call %s", r.URL.Path)
			return nil, io.ErrUnexpectedEOF
		}
		raw, _ := json.Marshal(body)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Request: r}, nil
	})
	panel.s.ClickMax, panel.s.ClickMaxSync = client, true
	panel.s.ClickMaxSettings = clickmax.Settings{
		PipelineID: pipeline, AutoLinkSince: now.Add(-time.Minute),
		Stages:           map[string]string{"contact_pending": initial, "booked": booked},
		MeetingDateField: dateField, MeetingTimeField: timeField,
	}
	finished := make(chan struct{})
	go func() { defer close(finished); panel.s.RunClickMax(ctx) }()
	defer func() { cancel(); <-finished }()
	deadline := time.Now().Add(12 * time.Second)
	for time.Now().Before(deadline) {
		_, err := db.Pool.Exec(ctx, `UPDATE bia_go.clickmax_intake SET next_attempt_at=now() WHERE lead_id=$1 AND dispatched_at IS NOT NULL AND error_code='clickmax_unavailable'`, lead.ID)
		if err != nil {
			t.Fatal(err)
		}
		var synced bool
		err = db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM bia_go.clickmax_cards WHERE lead_id=$1 AND confirmed_stage=$2 AND auto_linked AND meeting_synced_start=$3)`, lead.ID, booked, start).Scan(&synced)
		if err != nil {
			t.Fatal(err)
		}
		if synced {
			cancel()
			<-finished
			if creates != 1 || moves != 1 {
				t.Fatal("card operation was repeated", creates, moves)
			}
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("automatic card never reached Reunião Agendada")
}
