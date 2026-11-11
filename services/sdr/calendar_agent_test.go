package main

import (
	"context"
	"crypto/sha256"
	"net/http/httptest"
	"sdr-next-pilot/internal/calendarworker"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func TestCalendarSDRContextToWorkerBooksOnlyAfterExplicitChoice(t *testing.T) {
	a, creds, cq, eq, now := pipelineApp(t)
	*now = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	a.calendarEnabled = true
	a.workerSecrets["calendar"] = sha256.Sum256([]byte("calendar-test-secret"))
	server := httptest.NewServer(a.privateWorkers())
	defer server.Close()
	queue := &sdrsdk.Client{Base: server.URL, Token: "calendar-test-secret", HTTP: server.Client()}
	calWorker := calendarworker.Worker{Queue: queue, Provider: func(sdrsdk.CalendarJob) calendarworker.Provider { return fakeCalendarProvider{} }}
	admin := login(t, a, creds, "alfa.admin")
	fixture := &calFixture{a: a, admin: admin, now: now}
	cal := fixture.create(t, admin, "Agenda do SDR", calendarPolicy())
	input(t, a, admin, "ask-times", "Quero consultar os horários para conversar amanhã.")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	executor := executionworker.Worker{Queue: eq, Planner: mockPlanner{Call: func(c sdrsdk.Prepared) sdrsdk.Outcome {
		if !strings.Contains(string(c.Calendar), cal.ID) {
			t.Fatal("authorized agenda absent from context")
		}
		o := answer()
		o.Decision = sdrsdk.Decision{Action: "reply", Message: "Vou consultar os horários.", Calendar: &sdrsdk.CalendarIntent{Kind: "availability", CalendarIDs: []string{cal.ID}, Mode: "any", From: now.Add(time.Hour).Format(time.RFC3339), To: now.Add(4 * time.Hour).Format(time.RFC3339), Duration: 30, EvidenceMessageID: c.InputIDs[0]}}
		return o
	}}}
	if ok, e := executor.Once(context.Background()); !ok || e != nil {
		t.Fatal(ok, e)
	}
	if ok, e := calWorker.Once(context.Background()); !ok || e != nil {
		t.Fatal(ok, e)
	}
	var offer *CalendarRequest
	for _, j := range a.state.Calendars.Requests {
		if j.Input.Kind == "availability" {
			offer = j
		}
	}
	if offer == nil || offer.Status != "completed" || len(offer.Result.Slots) == 0 {
		t.Fatal("real options absent")
	}
	if len(a.state.Calendars.Bookings) != 0 {
		t.Fatal("availability booked without a choice")
	}
	_ = a.Drain()
	input(t, a, admin, "choose-time", "Quero a opção 1")
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	executor.Planner = mockPlanner{Call: func(c sdrsdk.Prepared) sdrsdk.Outcome {
		o := answer()
		o.Decision = sdrsdk.Decision{Action: "reply", Message: "Vou conferir essa opção.", Calendar: &sdrsdk.CalendarIntent{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID, EvidenceMessageID: c.InputIDs[0]}}
		return o
	}}
	if ok, e := executor.Once(context.Background()); !ok || e != nil {
		t.Fatal("calendar choice", ok, e)
	}
	if len(a.state.Calendars.Bookings) != 0 {
		t.Fatal("planner invented a confirmation")
	}
	if ok, e := calWorker.Once(context.Background()); !ok || e != nil {
		t.Fatal(ok, e)
	}
	if len(a.state.Calendars.Bookings) != 1 {
		t.Fatal("calendar worker did not book")
	}
	last := a.state.Messages["conv_demo_alfa"]
	if !strings.Contains(last[len(last)-1].Text, "Agendamento confirmado") {
		t.Fatal("confirmed worker result not delivered")
	}
	if len(a.state.Messages["conv_demo_beta"]) != 0 {
		t.Fatal("calendar reply leaked tenant")
	}
}

func TestCalendarExternalEffectRemainsVisibleAfterPauseDuringGoogleWrite(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "Google pause", calendarPolicy())
	cal.Provider = "google"
	cal.Connection = "account"
	f.a.state.Calendars.Connections["account"] = &CalendarConnection{ID: "account", Organization: cal.Organization, Status: "connected"}
	provider := fakeCalendarProvider{}
	f.worker.Provider = func(sdrsdk.CalendarJob) calendarworker.Provider { return provider }
	conv := f.a.state.Conversations["conv_demo_alfa"]
	offer, e := f.a.newCalendarRequest(User{ID: "agent:sdr", Org: conv.Org}, sdrsdk.CalendarInput{Kind: "availability", CalendarIDs: []string{cal.ID}, Mode: "any", From: f.now.Add(time.Hour), To: f.now.Add(4 * time.Hour), Duration: 30, ConversationID: conv.ID}, "sdr", "offer", "")
	if e != nil {
		t.Fatal(e)
	}
	_ = f.a.transact(func() { f.a.storeCalendarRequest(offer) })
	f.once(t)
	j, e := f.a.newCalendarRequest(User{ID: "agent:sdr", Org: conv.Org}, sdrsdk.CalendarInput{Kind: "book", AvailabilityID: offer.ID, SlotID: offer.Result.Slots[0].ID, ConversationID: conv.ID}, "sdr", "book", "")
	if e != nil {
		t.Fatal(e)
	}
	_ = f.a.transact(func() { f.a.storeCalendarRequest(j) })
	provider.ApplyFn = func(_ string, event sdrsdk.CalendarEvent) (sdrsdk.CalendarEvent, error) {
		f.a.mu.Lock()
		conv.Automation = "human"
		f.a.state.Generation[conv.ID]++
		f.a.mu.Unlock()
		event.ETag = "actual-external-result"
		return event, nil
	}
	before := len(f.a.state.Messages[conv.ID])
	f.once(t)
	b := f.a.state.Calendars.Bookings[j.Event.BookingID]
	if j.Status != "confirmed" || b == nil || !b.NeedsReview {
		t.Fatal("external truth was discarded", j.Result)
	}
	if len(f.a.state.Messages[conv.ID]) != before {
		t.Fatal("automation replied after human takeover")
	}
}

func TestCalendarContextIsDeterministicWithMultipleAgendas(t *testing.T) {
	f := calendarApp(t)
	for _, name := range []string{"A", "B", "C", "D"} {
		f.create(t, f.admin, name, calendarPolicy())
	}
	c := f.a.state.Conversations["conv_demo_alfa"]
	initial := string(f.a.calendarContext(c))
	for n := 0; n < 30; n++ {
		if string(f.a.calendarContext(c)) != initial {
			t.Fatal("calendar context changed only because map iteration order changed")
		}
	}
}

func TestCalendarLovableWorkflowQueuesWorkerAndPreviewHasNoEffects(t *testing.T) {
	f := calendarApp(t)
	cal := f.create(t, f.admin, "Workflow calendar", calendarPolicy())
	f.a.pipelineEnabled = true
	f.a.executionModel = "test-model"
	f.a.workerSecrets["execution"] = sha256.Sum256([]byte("calendar-execution-test"))
	server := httptest.NewServer(f.a.privateWorkers())
	defer server.Close()
	queue := &sdrsdk.Client{Base: server.URL, Token: "calendar-execution-test", Model: "test-model", HTTP: server.Client()}
	cal.Agents["workflow:horarios"] = sdrsdk.CalendarGrant{Read: true}
	ws := f.a.state.Platform.Workspaces[cal.Organization]
	config := clonePlatform(currentPlatform(ws).Config)
	config.Tools = append(config.Tools, ToolConfig{ID: "calendar_lookup", Name: "Horários", Handler: "calendar.availability", Enabled: true, Approval: "automatic", ApproverRoles: []string{"admin"}})
	literal := func(v string) ValueBinding { return ValueBinding{From: "literal", Value: v} }
	config.Workflows = append(config.Workflows, WorkflowConfig{ID: "horarios", Name: "Consultar agenda", Solution: "sdr", Enabled: true, Roles: []string{"admin", "operator"}, Inputs: []InputField{{Name: "conversation_id", Label: "Conversa", Required: true, MaxLength: 100}}, Steps: []FlowStep{{ID: "consulta", ToolID: "calendar_lookup", Inputs: map[string]ValueBinding{"conversation_id": {From: "input", Key: "conversation_id"}, "calendar_ids": literal(cal.ID), "mode": literal("any"), "from": literal(f.now.Add(time.Hour).Format(time.RFC3339)), "to": literal(f.now.Add(4 * time.Hour).Format(time.RFC3339)), "duration_minutes": literal("30")}}}})
	if problems := validatePlatform(config); len(problems) > 0 {
		t.Fatal(problems)
	}
	ws.Draft = config
	ws.Versions = append(ws.Versions, PlatformVersion{Version: 2, Config: clonePlatform(config), PublishedAt: *f.now, PublishedBy: "test"})
	executor := executionworker.Worker{Queue: queue}
	for _, mode := range []string{"preview", "apply"} {
		code, body := req(f.a, "POST", "/v1/platform/executions", f.admin, "calendar-flow-"+mode, map[string]any{"workflow_id": "horarios", "mode": mode, "source": "published", "input": map[string]string{"conversation_id": "conv_demo_alfa"}, "expected_configuration_version": 2})
		if code != 202 {
			t.Fatal(code, body)
		}
		if ok, e := executor.OnceOperation(context.Background()); !ok || e != nil {
			t.Fatal("workflow calendar", ok, e)
		}
		if mode == "preview" && len(f.a.state.Calendars.Requests) != 0 {
			t.Fatal("preview queued calendar effect")
		}
	}
	if len(f.a.state.Calendars.Requests) != 1 {
		t.Fatal("workflow did not queue exactly one request")
	}
	f.once(t)
	for _, j := range f.a.state.Calendars.Requests {
		if j.Status != "completed" || j.Source != "workflow:horarios" {
			t.Fatal(j.Result)
		}
	}
}
