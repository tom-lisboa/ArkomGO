package domain

import (
	"strings"
	"testing"
	"time"
)

func TestClickMaxPublicOfferAndSelection(t *testing.T) {
	now := time.Date(2026, 11, 7, 16, 0, 0, 0, time.UTC)
	p := Policy{ClickMaxPublicBooking: true, SchedulingURL: "https://app.clickmax.io/book/workspace/agenda", TimeZone: "America/Cuiaba", DisableFollowups: true}
	s := State{ID: "lead", Stage: "engaged"}
	first := Slot{ID: "first", Provider: ClickMaxPublicProvider, Start: now.Add(time.Hour), End: now.Add(2 * time.Hour)}
	second := Slot{ID: "second", Provider: ClickMaxPublicProvider, Start: now.Add(2 * time.Hour), End: now.Add(3 * time.Hour)}
	third := Slot{ID: "third", Provider: ClickMaxPublicProvider, Start: now.Add(3 * time.Hour), End: now.Add(4 * time.Hour)}
	event := Event{ID: "offer", Kind: "message.received", At: now, Text: "Quero agendar"}
	r := Reduce(s, event, Decision{Action: "offer_slots"}, []Slot{second, first, third}, p, now)
	if len(r.State.Offered) != 2 || len(r.Effects) != 1 || strings.Contains(r.Effects[0].Text, p.SchedulingURL) || !strings.Contains(r.Effects[0].Text, "às 14h ou sábado, 07/11, às 15h") {
		t.Fatalf("expected two public options without a link: %+v", r)
	}
	event.ID, event.Text = "choice", "O primeiro"
	d := Decision{Action: "book", SlotID: first.ID}
	picked := Reduce(r.State, event, d, []Slot{first, second}, p, now)
	if picked.State.Booking != nil || len(picked.Effects) != 1 || picked.Effects[0].Kind != "book" || picked.Effects[0].Slot == nil || picked.Effects[0].Slot.ID != first.ID {
		t.Fatalf("expected scheduling job after explicit choice: %+v", picked)
	}
	event.Text = "Sim"
	ambiguous := Reduce(r.State, event, d, []Slot{first, second}, p, now)
	if len(ambiguous.Effects) != 1 || ambiguous.Effects[0].Kind != "send" || strings.Contains(ambiguous.Effects[0].Text, p.SchedulingURL) {
		t.Fatalf("expected clarification for ambiguous choice: %+v", ambiguous)
	}
	event.Text = "Pode me mandar o link?"
	direct := Reduce(s, event, Decision{Action: "reply", Message: p.SchedulingURL}, []Slot{first, second}, p, now)
	if len(direct.State.Offered) != 2 || len(direct.Effects) != 1 || strings.Contains(direct.Effects[0].Text, p.SchedulingURL) {
		t.Fatalf("expected options in WhatsApp: %+v", direct)
	}
}

func TestClickMaxMeetingTimeMatchesBrasiliaWithoutCustomerTimezone(t *testing.T) {
	start := time.Date(2026, 11, 11, 17, 0, 0, 0, time.UTC)
	b := &Booking{Provider: ClickMaxPublicProvider, Start: start, End: start.Add(45 * time.Minute)}
	s := State{Booking: b, Profile: Form{Name: "Eugênio"}}
	p := Policy{TimeZone: "America/Cuiaba"}
	const want = "11/11 às 14:00 (horário de Brasília)"
	if ContactOpening(s, p, start.Add(-time.Hour)).Variables["2"] != want || MeetingStartOpening(s, p).Variables["2"] != want || ProactiveOpening(s, p, "meeting_checkin_1h").Variables["2"] != want {
		t.Fatal("meeting messages disagree with the booking reference timezone")
	}
	s.Profile.TimeZone = "America/Cuiaba"
	if got := MeetingTime(*b, p, s); !strings.Contains(got, "13:00") || strings.Contains(got, "Brasília") {
		t.Fatal(got)
	}
}
