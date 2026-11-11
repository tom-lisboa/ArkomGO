package clickmax

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func ParseCalendarAttendants(raw string) (map[string]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var out map[string]string
	if json.Unmarshal([]byte(raw), &out) != nil || out == nil {
		return nil, errors.New("invalid BIA_CLICKMAX_CALENDAR_ATTENDANTS")
	}
	seen := map[string]bool{}
	for user, attendant := range out {
		id := strings.ToLower(attendant)
		if user == "" || strings.TrimSpace(user) != user || !ValidID(id) || seen[id] {
			return nil, errors.New("invalid BIA_CLICKMAX_CALENDAR_ATTENDANTS")
		}
		seen[id] = true
		out[user] = id
	}
	return out, nil
}

type Appointment struct {
	ID          string    `json:"id"`
	ContactID   string    `json:"leadId"`
	AttendantID string    `json:"attendantId"`
	Start       time.Time `json:"startAt"`
	End         time.Time `json:"endAt"`
	Status      string    `json:"status"`
	Notes       string    `json:"notes"`
	ScheduleID  string    `json:"appointmentScheduleId"`
	PipelineID  string    `json:"opportunityPipelineId"`
	CardID      string    `json:"opportunityCardId"`
	LeadPhone   string    `json:"leadPhone"`
	LeadEmail   string    `json:"leadEmail"`
	MeetingLink string    `json:"meetingLink"`
	Origin      string    `json:"origin"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Attendant struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	SeatID string `json:"seatId"`
	Agent  bool   `json:"isAiAgent"`
}

func (c *Client) Attendants(ctx context.Context) ([]Attendant, error) {
	var out struct {
		Data []Attendant `json:"data"`
	}
	if err := c.request(ctx, http.MethodGet, "/attendants/list", nil, &out); err != nil {
		return nil, err
	}
	if out.Data == nil {
		return nil, errors.New("clickmax_attendant_list_invalid")
	}
	active := []Attendant{}
	for _, a := range out.Data {
		if ValidID(a.ID) && ValidID(a.SeatID) && !a.Agent {
			active = append(active, a)
		}
	}
	return active, nil
}

func (a Appointment) Active() bool { return a.Status == "scheduled" || a.Status == "confirmed" }

func (c *Client) Appointments(ctx context.Context, attendant, contact string, from, to time.Time) ([]Appointment, error) {
	return c.appointments(ctx, attendant, contact, "", from, to)
}

func (c *Client) PipelineAppointments(ctx context.Context, pipeline string, from, to time.Time) ([]Appointment, error) {
	return c.appointments(ctx, "", "", pipeline, from, to)
}

func (c *Client) appointments(ctx context.Context, attendant, contact, pipeline string, from, to time.Time) ([]Appointment, error) {
	q := url.Values{"includeInactiveCards": {"true"}}
	if pipeline != "" {
		q.Set("pipelineId", pipeline)
	}
	if attendant != "" {
		q.Set("attendantId", attendant)
	}
	if contact != "" {
		q.Set("leadId", contact)
	}
	if !from.IsZero() {
		q.Set("startDate", from.UTC().Format(time.RFC3339Nano))
	}
	if !to.IsZero() {
		q.Set("endDate", to.UTC().Format(time.RFC3339Nano))
	}
	var out struct {
		Data []Appointment `json:"data"`
	}
	if err := c.request(ctx, http.MethodGet, "/scheduled-calls/list?"+q.Encode(), nil, &out); err != nil {
		return nil, err
	}
	if out.Data == nil {
		return nil, errors.New("clickmax_appointment_list_invalid")
	}
	for _, a := range out.Data {
		if !ValidID(a.ID) || a.Start.IsZero() || !a.End.After(a.Start) || a.Status == "" ||
			(attendant != "" && a.AttendantID != attendant) || (contact != "" && a.ContactID != contact) {
			return nil, errors.New("clickmax_appointment_list_unverified")
		}
	}
	return out.Data, nil
}

func (c *Client) Appointment(ctx context.Context, id string) (Appointment, error) {
	var out Appointment
	err := c.request(ctx, http.MethodGet, "/scheduled-calls/get?id="+url.QueryEscape(id), nil, &out)
	if err == nil && out.ID != id {
		err = errors.New("clickmax_appointment_unverified")
	}
	return out, err
}

func (c *Client) BookAppointment(ctx context.Context, a Appointment, card string) (Appointment, error) {
	var out Appointment
	body := map[string]any{"leadId": a.ContactID, "attendantId": a.AttendantID, "startAt": a.Start.UTC(), "endAt": a.End.UTC(), "subject": "Diagnóstico Arkom", "meetingLink": "", "notes": a.Notes}
	if card != "" {
		body["opportunityCardId"] = card
	}
	err := c.request(ctx, http.MethodPost, "/scheduled-calls/create", body, &out)
	return out, err
}

// BookTeamAppointment lets ClickMax select an eligible seller using the
// schedule's own rotation and connected calendars.
func (c *Client) BookTeamAppointment(ctx context.Context, a Appointment) (Appointment, error) {
	var out Appointment
	body := map[string]any{
		"leadId": a.ContactID, "appointmentScheduleId": a.ScheduleID,
		"startAt": a.Start.UTC(), "endAt": a.End.UTC(),
		"subject": "Diagnóstico Arkom", "notes": a.Notes,
	}
	if a.CardID != "" {
		body["opportunityCardId"] = a.CardID
	}
	err := c.request(ctx, http.MethodPost, "/scheduled-calls/create", body, &out)
	return out, err
}

func (c *Client) RescheduleAppointment(ctx context.Context, a Appointment) (Appointment, error) {
	var out Appointment
	err := c.request(ctx, http.MethodPost, "/scheduled-calls/update", map[string]any{
		"id": a.ID, "startAt": a.Start.UTC(), "endAt": a.End.UTC(),
	}, &out)
	return out, err
}

func (c *Client) CancelAppointment(ctx context.Context, id string) (Appointment, error) {
	var out Appointment
	err := c.request(ctx, http.MethodPost, "/scheduled-calls/cancel", map[string]string{"id": id}, &out)
	return out, err
}

// ContactsByEmail deliberately limits results to two. A second match makes
// the identity ambiguous, even when one of the records has a phone.
func (c *Client) ContactsByEmail(ctx context.Context, email string) ([]Contact, error) {
	var out struct {
		Data []Contact `json:"data"`
	}
	body := map[string]any{"perPage": 2, "filters": []map[string]any{
		{"field": "email", "operator": "equals", "negation": false, "valueString": email},
	}}
	err := c.request(ctx, http.MethodPost, "/leads/search", body, &out)
	if err == nil && out.Data == nil {
		err = errors.New("clickmax_contact_list_invalid")
	}
	return out.Data, err
}
