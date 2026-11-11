package sdrsdk

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

type CalendarWindow struct {
	Day   int `json:"day"`
	Start int `json:"start_minute"`
	End   int `json:"end_minute"`
}
type CalendarPolicy struct {
	Timezone     string           `json:"timezone"`
	Windows      []CalendarWindow `json:"windows"`
	BlockedDates []string         `json:"blocked_dates"`
	Durations    []int            `json:"durations"`
	Step         int              `json:"step_minutes"`
	BufferBefore int              `json:"buffer_before_minutes"`
	BufferAfter  int              `json:"buffer_after_minutes"`
	Notice       int              `json:"minimum_notice_minutes"`
	Horizon      int              `json:"horizon_days"`
	Approval     bool             `json:"require_approval"`
}
type CalendarGrant struct {
	Read       bool `json:"read"`
	Book       bool `json:"book"`
	Reschedule bool `json:"reschedule"`
	Cancel     bool `json:"cancel"`
}
type CalendarRef struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Provider   string         `json:"provider"`
	Connection string         `json:"connection_id,omitempty"`
	ExternalID string         `json:"external_id,omitempty"`
	Writable   bool           `json:"writable"`
	Policy     CalendarPolicy `json:"policy"`
}
type CalendarInterval struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}
type CalendarSlot struct {
	ID         string    `json:"id"`
	CalendarID string    `json:"calendar_id"`
	CheckedIDs []string  `json:"checked_calendar_ids"`
	Start      time.Time `json:"start"`
	End        time.Time `json:"end"`
	Timezone   string    `json:"timezone"`
}
type CalendarInput struct {
	Kind             string    `json:"kind"`
	CalendarIDs      []string  `json:"calendar_ids"`
	Mode             string    `json:"mode"`
	From             time.Time `json:"from"`
	To               time.Time `json:"to"`
	Duration         int       `json:"duration_minutes"`
	AvailabilityID   string    `json:"availability_id"`
	SlotID           string    `json:"slot_id"`
	BookingID        string    `json:"booking_id"`
	ExpectedRevision int       `json:"expected_revision"`
	ConversationID   string    `json:"conversation_id"`
	Summary          string    `json:"summary"`
}
type CalendarEvent struct {
	ID               string    `json:"id"`
	ETag             string    `json:"etag"`
	BookingID        string    `json:"booking_id"`
	OrganizationHash string    `json:"organization_hash"`
	Summary          string    `json:"summary"`
	Start            time.Time `json:"start"`
	End              time.Time `json:"end"`
}
type CalendarJob struct {
	ID           string                        `json:"id"`
	Organization string                        `json:"organization_id"`
	Lease        string                        `json:"lease"`
	Input        CalendarInput                 `json:"input"`
	Calendars    []CalendarRef                 `json:"calendars"`
	Busy         map[string][]CalendarInterval `json:"busy"`
	Slot         *CalendarSlot                 `json:"slot,omitempty"`
	Event        CalendarEvent                 `json:"event"`
	Now          time.Time                     `json:"now"`
	Reconcile    bool                          `json:"reconcile"`
}
type CalendarResult struct {
	Status  string         `json:"status"`
	Error   string         `json:"error,omitempty"`
	Slots   []CalendarSlot `json:"slots,omitempty"`
	Limited bool           `json:"limited"`
	Event   *CalendarEvent `json:"event,omitempty"`
}
type CalendarQueue interface {
	ClaimCalendar(context.Context) (CalendarJob, bool, error)
	AuthorizeCalendar(context.Context, CalendarJob) error
	CalendarCredential(context.Context, CalendarJob, string) (string, error)
	CompleteCalendar(context.Context, CalendarJob, CalendarResult) error
}

func (c *Client) ClaimCalendar(ctx context.Context) (CalendarJob, bool, error) {
	var j CalendarJob
	r, e := http.NewRequestWithContext(ctx, "POST", c.Base+"/internal/workers/calendar/claim", nil)
	if e != nil {
		return j, false, e
	}
	r.Header.Set("Authorization", "Bearer "+c.Token)
	resp, e := c.HTTP.Do(r)
	if e != nil {
		return j, false, ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode == 204 {
		return j, false, nil
	}
	if resp.StatusCode != 200 {
		return j, false, ErrUnavailable
	}
	if e = json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&j); e != nil {
		return j, false, e
	}
	return j, true, nil
}
func (c *Client) AuthorizeCalendar(ctx context.Context, j CalendarJob) error {
	_, e := c.post(ctx, "/internal/workers/calendar/authorize", map[string]string{"id": j.ID, "lease": j.Lease}, nil)
	return e
}
func (c *Client) CalendarCredential(ctx context.Context, j CalendarJob, connection string) (string, error) {
	var out struct {
		Token string `json:"access_token"`
	}
	_, e := c.post(ctx, "/internal/workers/calendar/credential", map[string]string{"id": j.ID, "lease": j.Lease, "connection_id": connection}, &out)
	if e == nil && out.Token == "" {
		e = errors.New("calendar_credential_missing")
	}
	return out.Token, e
}
func (c *Client) CompleteCalendar(ctx context.Context, j CalendarJob, result CalendarResult) error {
	_, e := c.post(ctx, "/internal/workers/calendar/complete", struct {
		ID     string         `json:"id"`
		Lease  string         `json:"lease"`
		Result CalendarResult `json:"result"`
	}{j.ID, j.Lease, result}, nil)
	return e
}
