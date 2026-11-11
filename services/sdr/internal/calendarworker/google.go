package calendarworker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"sdr-next-pilot/pkg/sdrsdk"
	"time"
)

type Google struct {
	HTTP  *http.Client
	Token func(context.Context, string) (string, error)
}

func NewGoogle(token func(context.Context, string) (string, error)) *Google {
	return &Google{HTTP: &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, Token: token}
}
func (g *Google) call(ctx context.Context, ref sdrsdk.CalendarRef, method, path string, body any, etag string) (int, []byte, error) {
	token, e := g.Token(ctx, ref.Connection)
	if e != nil {
		return 0, nil, ErrUnavailable
	}
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	r, e := http.NewRequestWithContext(ctx, method, "https://www.googleapis.com/calendar/v3"+path, bytes.NewReader(raw))
	if e != nil {
		return 0, nil, ErrUnavailable
	}
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Content-Type", "application/json")
	if etag != "" {
		r.Header.Set("If-Match", etag)
	}
	response, e := g.HTTP.Do(r)
	if e != nil {
		return 0, nil, ErrUncertain
	}
	defer response.Body.Close()
	data, e := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
	if e != nil || len(data) > 4<<20 {
		return response.StatusCode, nil, ErrUncertain
	}
	return response.StatusCode, data, nil
}

type googleTime struct {
	DateTime string `json:"dateTime"`
	Date     string `json:"date"`
}
type googleEvent struct {
	ID           string     `json:"id"`
	ETag         string     `json:"etag"`
	Status       string     `json:"status"`
	Summary      string     `json:"summary"`
	Transparency string     `json:"transparency"`
	Start        googleTime `json:"start"`
	End          googleTime `json:"end"`
	Extended     struct {
		Private map[string]string `json:"private"`
	} `json:"extendedProperties"`
}

func parseGoogleTime(v googleTime, zone string) (time.Time, error) {
	if v.DateTime != "" {
		return time.Parse(time.RFC3339, v.DateTime)
	}
	loc, e := time.LoadLocation(zone)
	if e != nil {
		return time.Time{}, e
	}
	return time.ParseInLocation("2006-01-02", v.Date, loc)
}
func eventView(v googleEvent, ref sdrsdk.CalendarRef) (sdrsdk.CalendarEvent, error) {
	if v.Status == "cancelled" {
		return sdrsdk.CalendarEvent{}, ErrNotFound
	}
	start, e := parseGoogleTime(v.Start, ref.Policy.Timezone)
	if e != nil {
		return sdrsdk.CalendarEvent{}, e
	}
	end, e := parseGoogleTime(v.End, ref.Policy.Timezone)
	if e != nil || !end.After(start) {
		return sdrsdk.CalendarEvent{}, ErrUnavailable
	}
	return sdrsdk.CalendarEvent{ID: v.ID, ETag: v.ETag, Summary: v.Summary, Start: start, End: end, BookingID: v.Extended.Private["sdr_booking"], OrganizationHash: v.Extended.Private["sdr_org"]}, nil
}
func (g *Google) Busy(ctx context.Context, ref sdrsdk.CalendarRef, from, to time.Time, exclude string) ([]sdrsdk.CalendarInterval, error) {
	if exclude != "" {
		return g.busyExcept(ctx, ref, from, to, exclude)
	}
	code, raw, e := g.call(ctx, ref, "POST", "/freeBusy", map[string]any{"timeMin": from.UTC().Format(time.RFC3339), "timeMax": to.UTC().Format(time.RFC3339), "items": []map[string]string{{"id": ref.ExternalID}}}, "")
	if e != nil || code != 200 {
		return nil, ErrUnavailable
	}
	var result struct {
		Calendars map[string]struct {
			Busy   []sdrsdk.CalendarInterval `json:"busy"`
			Errors []json.RawMessage         `json:"errors"`
		} `json:"calendars"`
	}
	if json.Unmarshal(raw, &result) != nil {
		return nil, ErrUnavailable
	}
	entry, ok := result.Calendars[ref.ExternalID]
	if !ok || len(entry.Errors) > 0 || entry.Busy == nil {
		return nil, ErrUnavailable
	}
	for _, b := range entry.Busy {
		if !b.End.After(b.Start) {
			return nil, ErrUnavailable
		}
	}
	return entry.Busy, nil
}
func (g *Google) busyExcept(ctx context.Context, ref sdrsdk.CalendarRef, from, to time.Time, exclude string) ([]sdrsdk.CalendarInterval, error) {
	busy := []sdrsdk.CalendarInterval{}
	page := ""
	for n := 0; n < 8; n++ {
		q := url.Values{"timeMin": {from.UTC().Format(time.RFC3339)}, "timeMax": {to.UTC().Format(time.RFC3339)}, "singleEvents": {"true"}, "maxResults": {"2500"}, "showDeleted": {"false"}}
		if page != "" {
			q.Set("pageToken", page)
		}
		code, raw, e := g.call(ctx, ref, "GET", "/calendars/"+url.PathEscape(ref.ExternalID)+"/events?"+q.Encode(), nil, "")
		if e != nil || code != 200 {
			return nil, ErrUnavailable
		}
		var out struct {
			Items []googleEvent `json:"items"`
			Next  string        `json:"nextPageToken"`
		}
		if json.Unmarshal(raw, &out) != nil {
			return nil, ErrUnavailable
		}
		for _, v := range out.Items {
			if v.ID == exclude || v.Status == "cancelled" || v.Transparency == "transparent" {
				continue
			}
			event, e := eventView(v, ref)
			if e != nil {
				return nil, ErrUnavailable
			}
			busy = append(busy, sdrsdk.CalendarInterval{Start: event.Start, End: event.End})
		}
		if out.Next == "" {
			return busy, nil
		}
		page = out.Next
	}
	return nil, ErrUnavailable
}
func (g *Google) Get(ctx context.Context, ref sdrsdk.CalendarRef, id string) (sdrsdk.CalendarEvent, error) {
	code, raw, e := g.call(ctx, ref, "GET", "/calendars/"+url.PathEscape(ref.ExternalID)+"/events/"+url.PathEscape(id), nil, "")
	if code == 404 || code == 410 {
		// Google can hide an inaccessible resource behind 404. Absence proves a
		// cancellation only while the calendar remains accessible to this account.
		if !g.accessible(ctx, ref) {
			return sdrsdk.CalendarEvent{}, ErrUnavailable
		}
		return sdrsdk.CalendarEvent{}, ErrNotFound
	}
	if e != nil || code != 200 {
		return sdrsdk.CalendarEvent{}, ErrUnavailable
	}
	var event googleEvent
	if json.Unmarshal(raw, &event) != nil {
		return sdrsdk.CalendarEvent{}, ErrUnavailable
	}
	if event.Status != "confirmed" && event.Status != "cancelled" {
		return sdrsdk.CalendarEvent{}, ErrConflict
	}
	return eventView(event, ref)
}
func (g *Google) accessible(ctx context.Context, ref sdrsdk.CalendarRef) bool {
	code, raw, e := g.call(ctx, ref, "GET", "/users/me/calendarList/"+url.PathEscape(ref.ExternalID), nil, "")
	var item struct {
		ID   string `json:"id"`
		Role string `json:"accessRole"`
	}
	if e != nil || code != 200 || json.Unmarshal(raw, &item) != nil || item.ID != ref.ExternalID {
		return false
	}
	return !ref.Writable || item.Role == "writer" || item.Role == "owner"
}
func (g *Google) Apply(ctx context.Context, ref sdrsdk.CalendarRef, kind string, event sdrsdk.CalendarEvent) (sdrsdk.CalendarEvent, error) {
	if !ref.Writable {
		return event, ErrConflict
	}
	path := "/calendars/" + url.PathEscape(ref.ExternalID) + "/events"
	method := "POST"
	if kind != "book" {
		current, e := g.Get(ctx, ref, event.ID)
		if kind == "cancel" && errors.Is(e, ErrNotFound) {
			return event, nil
		}
		if e != nil {
			return event, e
		}
		if current.BookingID != event.BookingID || current.OrganizationHash != event.OrganizationHash || current.ETag != event.ETag || event.ETag == "" {
			return event, ErrConflict
		}
		path += "/" + url.PathEscape(event.ID)
		method = "PATCH"
		if kind == "cancel" {
			method = "DELETE"
		}
	}
	body := map[string]any{"summary": event.Summary, "start": map[string]string{"dateTime": event.Start.Format(time.RFC3339), "timeZone": ref.Policy.Timezone}, "end": map[string]string{"dateTime": event.End.Format(time.RFC3339), "timeZone": ref.Policy.Timezone}, "extendedProperties": map[string]any{"private": map[string]string{"sdr_booking": event.BookingID, "sdr_org": event.OrganizationHash}}}
	if kind == "book" {
		body["id"] = event.ID
	}
	var payload any = body
	if method == "DELETE" {
		payload = nil
	}
	code, raw, e := g.call(ctx, ref, method, path+"?sendUpdates=none", payload, event.ETag)
	if e != nil {
		return event, ErrUncertain
	}
	if code == 409 && kind == "book" {
		existing, err := g.Get(ctx, ref, event.ID)
		if err == nil && existing.BookingID == event.BookingID && existing.OrganizationHash == event.OrganizationHash && existing.Start.Equal(event.Start) && existing.End.Equal(event.End) {
			return existing, nil
		}
		return event, ErrConflict
	}
	if code == 412 || code == 403 || code == 404 {
		return event, ErrConflict
	}
	if method == "DELETE" && code == 204 {
		return event, nil
	}
	if code < 200 || code >= 300 {
		return event, ErrUncertain
	}
	var v googleEvent
	if json.Unmarshal(raw, &v) != nil {
		return event, ErrUncertain
	}
	if v.Status != "confirmed" {
		return event, ErrUncertain
	}
	confirmed, e := eventView(v, ref)
	if e != nil || confirmed.ETag == "" || confirmed.BookingID != event.BookingID || confirmed.OrganizationHash != event.OrganizationHash || !confirmed.Start.Equal(event.Start) || !confirmed.End.Equal(event.End) {
		return event, ErrUncertain
	}
	return confirmed, nil
}
