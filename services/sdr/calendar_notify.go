package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

func (a *App) calendarNotify(j *CalendarRequest) {
	if j.Source == "manual" || j.Input.ConversationID == "" {
		return
	}
	c := a.state.Conversations[j.Input.ConversationID]
	if c == nil || c.Org != j.Organization || c.Automation != "active" || c.OptedOut || a.state.Generation[c.ID] != j.Generation || c.InputVersion != j.InputVersion {
		return
	}
	text := ""
	format := func(start time.Time, zone string) string {
		loc, e := time.LoadLocation(zone)
		if e != nil {
			loc = time.UTC
		}
		return start.In(loc).Format("02/01/2006 às 15:04") + " (" + zone + ")"
	}
	switch j.Result.Status {
	case "completed":
		if len(j.Result.Slots) == 0 {
			text = "Não encontrei horário livre nesse período nas agendas consultadas. Qual outro dia funciona para você?"
		} else {
			parts := []string{"Consultei estes horários disponíveis:"}
			for i, s := range j.Result.Slots[:min(3, len(j.Result.Slots))] {
				cal := a.state.Calendars.Calendars[s.CalendarID]
				name := ""
				if cal != nil {
					name = cal.Name
				}
				parts = append(parts, fmt.Sprintf("%d. %s · %s", i+1, format(s.Start, s.Timezone), name))
			}
			parts = append(parts, "Qual opção você quer agendar? A disponibilidade será conferida novamente antes da reserva.")
			text = strings.Join(parts, "\n")
		}
	case "confirmed":
		if j.Result.Event != nil {
			cal := a.state.Calendars.Calendars[j.CalendarIDs[0]]
			text = "Agendamento confirmado para " + format(j.Result.Event.Start, cal.Policy.Timezone) + "."
		}
	case "cancelled":
		if j.Result.Event != nil {
			text = "O cancelamento do seu agendamento foi confirmado."
		}
	case "uncertain":
		text = "Ainda não consegui confirmar o resultado na agenda. A equipe precisa conferir antes de tentar novamente."
	case "failed":
		text = "Não consegui concluir essa solicitação de agenda. Precisamos conferir a disponibilidade ou a autorização antes de tentar novamente."
	}
	if text == "" {
		return
	}
	m := a.message(c, text, "assistant")
	a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: m.ID, Org: c.Org, Generation: a.state.Generation[c.ID], Automatic: true})
	a.record(AuditEntry{Org: c.Org, Actor: "calendar-worker", Action: "calendar.conversation.result", Conversation: c.ID, Operation: j.ID})
}

// Agent context contains only permitted calendar descriptions and this contact's
// own requests/bookings, never event titles belonging to other contacts.
func (a *App) calendarContext(c *Conversation) []byte {
	if !a.calendarEnabled {
		return nil
	}
	calendars := []map[string]any{}
	for _, cal := range a.state.Calendars.Calendars {
		g := cal.Agents["sdr"]
		if cal.Organization == c.Org && cal.Enabled && g.Read {
			calendars = append(calendars, map[string]any{"id": cal.ID, "name": cal.Name, "timezone": cal.Policy.Timezone, "durations": cal.Policy.Durations, "permissions": g, "requires_approval": cal.Policy.Approval})
		}
	}
	if len(calendars) == 0 {
		return nil
	}
	sort.Slice(calendars, func(i, j int) bool { return calendars[i]["id"].(string) < calendars[j]["id"].(string) })
	offers := []map[string]any{}
	var latest *CalendarRequest
	for _, j := range a.state.Calendars.Requests {
		allowed := true
		for _, id := range j.CalendarIDs {
			cal := a.state.Calendars.Calendars[id]
			if cal == nil || cal.Organization != c.Org || !cal.Enabled || !cal.Agents["sdr"].Read {
				allowed = false
				break
			}
		}
		if allowed && j.Organization == c.Org && j.Input.ConversationID == c.ID && j.Input.Kind == "availability" && j.Status == "completed" && j.CreatedAt.Add(10*time.Minute).After(a.now()) && (latest == nil || j.CreatedAt.After(latest.CreatedAt) || j.CreatedAt.Equal(latest.CreatedAt) && j.ID < latest.ID) {
			latest = j
		}
	}
	if latest != nil {
		offers = append(offers, map[string]any{"availability_id": latest.ID, "slots": latest.Result.Slots[:min(3, len(latest.Result.Slots))]})
	}
	bookings := []*CalendarBooking{}
	for _, b := range a.state.Calendars.Bookings {
		if b.Organization == c.Org && b.Conversation == c.ID && b.Status == "confirmed" && b.Event.Start.After(a.now()) {
			bookings = append(bookings, b)
		}
	}
	sort.Slice(bookings, func(i, j int) bool {
		if bookings[i].Event.Start.Equal(bookings[j].Event.Start) {
			return bookings[i].ID < bookings[j].ID
		}
		return bookings[i].Event.Start.Before(bookings[j].Event.Start)
	})
	if len(bookings) > 4 {
		bookings = bookings[:4]
	}
	return mustCalendarJSON(map[string]any{"organization_id": c.Org, "calendars": calendars, "offers": offers, "bookings": bookings})
}
func mustCalendarJSON(v any) []byte { b, _ := json.Marshal(v); return b }
