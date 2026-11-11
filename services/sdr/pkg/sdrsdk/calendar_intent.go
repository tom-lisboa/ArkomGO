package sdrsdk

import (
	"encoding/json"
	"errors"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

type CalendarIntent struct {
	Kind              string   `json:"kind"`
	CalendarIDs       []string `json:"calendar_ids"`
	Mode              string   `json:"mode"`
	From              string   `json:"from"`
	To                string   `json:"to"`
	Duration          int      `json:"duration_minutes"`
	AvailabilityID    string   `json:"availability_id"`
	SlotID            string   `json:"slot_id"`
	BookingID         string   `json:"booking_id"`
	ExpectedRevision  int      `json:"expected_revision"`
	EvidenceMessageID string   `json:"evidence_message_id"`
}
type calendarHints struct {
	Organization string `json:"organization_id"`
	Calendars    []struct {
		ID          string        `json:"id"`
		Permissions CalendarGrant `json:"permissions"`
	} `json:"calendars"`
	Offers []struct {
		ID    string         `json:"availability_id"`
		Slots []CalendarSlot `json:"slots"`
	} `json:"offers"`
	Bookings []struct {
		ID           string `json:"id"`
		CalendarID   string `json:"calendar_id"`
		Conversation string `json:"conversation_id"`
		Revision     int    `json:"revision"`
		Status       string `json:"status"`
	} `json:"bookings"`
}

func ValidateCalendarIntent(c Prepared, intent *CalendarIntent) error {
	if intent == nil {
		return nil
	}
	bad := func() error { return errors.New("calendar_intent_not_authorized") }
	var hints calendarHints
	if len(c.Calendar) == 0 || json.Unmarshal(c.Calendar, &hints) != nil || hints.Organization != c.Organization || !slices.Contains([]string{"availability", "book", "reschedule", "cancel"}, intent.Kind) {
		return bad()
	}
	evidence := ""
	if !slices.Contains(c.InputIDs, intent.EvidenceMessageID) {
		return bad()
	}
	for _, m := range c.History {
		if m.ID == intent.EvidenceMessageID && m.Role == "user" {
			evidence = Normalized(m.Text)
		}
	}
	if evidence == "" {
		return bad()
	}
	grants := map[string]CalendarGrant{}
	for _, cal := range hints.Calendars {
		grants[cal.ID] = cal.Permissions
	}
	if intent.Kind == "availability" {
		from, e := time.Parse(time.RFC3339, intent.From)
		if e != nil {
			return bad()
		}
		to, e := time.Parse(time.RFC3339, intent.To)
		if e != nil || !to.After(from) || to.Sub(from) > 31*24*time.Hour || from.Before(c.At.Add(-time.Minute)) || len(intent.CalendarIDs) < 1 || len(intent.CalendarIDs) > 8 || !slices.Contains([]string{"all", "any"}, intent.Mode) || intent.Duration < 5 || intent.Duration > 240 {
			return bad()
		}
		for _, id := range intent.CalendarIDs {
			if !grants[id].Read {
				return bad()
			}
		}
		return nil
	}
	if strings.Contains(evidence, "?") || strings.Contains(evidence, "não ") || strings.Contains(evidence, "nao ") {
		return bad()
	}
	var slot *CalendarSlot
	if intent.Kind == "book" || intent.Kind == "reschedule" {
		for _, offer := range hints.Offers {
			if offer.ID != intent.AvailabilityID {
				continue
			}
			for index, s := range offer.Slots {
				if s.ID != intent.SlotID {
					continue
				}
				selected := evidence == strconv.Itoa(index+1)
				choices := regexp.MustCompile(`(?:opção|opcao)\s+([0-9]+)\b`).FindAllStringSubmatch(evidence, -1)
				for _, choice := range choices {
					if choice[1] != strconv.Itoa(index+1) {
						return bad()
					}
					selected = true
				}
				loc, e := time.LoadLocation(s.Timezone)
				if e != nil {
					return bad()
				}
				clock := s.Start.In(loc).Format("15:04")
				short := s.Start.In(loc).Format("15h04")
				matches := 0
				for _, candidate := range offer.Slots {
					if candidate.Start.In(loc).Format("15:04") == clock {
						matches++
					}
				}
				if !selected && matches == 1 && (strings.Contains(evidence, clock) || strings.Contains(evidence, short)) && hasAny(evidence, "agend", "marc", "reserv", "confirm") {
					selected = true
				}
				if !selected {
					return bad()
				}
				v := s
				slot = &v
			}
		}
		if slot == nil || !grants[slot.CalendarID].Read {
			return bad()
		}
		if intent.Kind == "book" && !grants[slot.CalendarID].Book {
			return bad()
		}
	}
	if intent.Kind == "cancel" || intent.Kind == "reschedule" {
		found := false
		for _, b := range hints.Bookings {
			if b.ID == intent.BookingID && b.Conversation == c.Conversation && b.Status == "confirmed" && b.Revision == intent.ExpectedRevision {
				g := grants[b.CalendarID]
				if intent.Kind == "cancel" && g.Cancel && hasAny(evidence, "cancel", "desmarc") {
					found = true
				}
				if intent.Kind == "reschedule" && g.Reschedule && slot != nil && slot.CalendarID == b.CalendarID {
					found = true
				}
			}
		}
		if !found {
			return bad()
		}
	}
	return nil
}
func hasAny(s string, values ...string) bool {
	for _, v := range values {
		if strings.Contains(s, v) {
			return true
		}
	}
	return false
}

func CalendarDecisionSchema(base map[string]any) map[string]any {
	props := map[string]any{}
	for _, name := range []string{"kind", "mode", "from", "to", "availability_id", "slot_id", "booking_id", "evidence_message_id"} {
		props[name] = map[string]any{"type": "string"}
	}
	props["kind"] = map[string]any{"type": "string", "enum": []string{"availability", "book", "reschedule", "cancel"}}
	props["calendar_ids"] = map[string]any{"type": "array", "items": map[string]any{"type": "string"}}
	props["duration_minutes"] = map[string]any{"type": "integer"}
	props["expected_revision"] = map[string]any{"type": "integer"}
	required := []string{}
	for name := range props {
		required = append(required, name)
	}
	sort.Strings(required)
	base["properties"].(map[string]any)["calendar"] = map[string]any{"anyOf": []any{map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}, map[string]any{"type": "null"}}}
	base["required"] = append(base["required"].([]string), "calendar")
	return base
}
