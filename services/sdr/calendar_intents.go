package main

import (
	"encoding/json"
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"strconv"
	"strings"
	"time"
)

func calendarIntentInput(intent *sdrsdk.CalendarIntent, conversation string) sdrsdk.CalendarInput {
	input := sdrsdk.CalendarInput{Kind: intent.Kind, CalendarIDs: intent.CalendarIDs, Mode: intent.Mode, Duration: intent.Duration, AvailabilityID: intent.AvailabilityID, SlotID: intent.SlotID, BookingID: intent.BookingID, ExpectedRevision: intent.ExpectedRevision, ConversationID: conversation, Summary: "Atendimento"}
	if intent.From != "" {
		input.From, _ = time.Parse(time.RFC3339, intent.From)
	}
	if intent.To != "" {
		input.To, _ = time.Parse(time.RFC3339, intent.To)
	}
	return input
}
func (a *App) calendarActionRequest(e *PlatformExecution, p sdrsdk.ActionPlan) (*CalendarRequest, error) {
	if !strings.HasPrefix(p.Handler, "calendar.") {
		return nil, nil
	}
	kind := strings.TrimPrefix(p.Handler, "calendar.")
	input := sdrsdk.CalendarInput{Kind: kind, ConversationID: p.Inputs["conversation_id"], Mode: p.Inputs["mode"], AvailabilityID: p.Inputs["availability_id"], SlotID: p.Inputs["slot_id"], BookingID: p.Inputs["booking_id"], Summary: p.Inputs["summary"]}
	if p.Inputs["calendar_ids"] != "" {
		input.CalendarIDs = strings.Split(p.Inputs["calendar_ids"], ",")
	}
	if p.Inputs["from"] != "" {
		input.From, _ = time.Parse(time.RFC3339, p.Inputs["from"])
	}
	if p.Inputs["to"] != "" {
		input.To, _ = time.Parse(time.RFC3339, p.Inputs["to"])
	}
	input.Duration, _ = strconv.Atoi(p.Inputs["duration_minutes"])
	input.ExpectedRevision, _ = strconv.Atoi(p.Inputs["expected_revision"])
	f, _ := platformWorkflow(e.Config, e.WorkflowID)
	request, err := a.newCalendarRequest(User{ID: e.Actor, Org: e.Org, Role: e.ActorRole}, input, "workflow:"+f.ID, sdrsdk.Digest(e.ID+":"+p.StepID), sdrsdk.MetricJob(e.Org, "execution", e.ID+":"+p.StepID))
	if err != nil {
		return nil, err
	}
	var out struct {
		ID string `json:"request_id"`
	}
	expected, err := sdrsdk.ComputeAction(p)
	if err != nil || json.Unmarshal(expected.Output, &out) != nil || out.ID == "" {
		return nil, errors.New("calendar_request_invalid")
	}
	request.ID = out.ID
	return request, nil
}
