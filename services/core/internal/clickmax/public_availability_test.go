package clickmax

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"arkom/bia/internal/domain"
)

func TestPublicAvailabilityReadsOnlyLiveTeamSlots(t *testing.T) {
	const path = "/public/booking/workspace/agenda"
	now := time.Date(2026, 11, 30, 16, 0, 0, 0, time.UTC)
	var reads atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reads.Add(1)
		q := r.URL.Query()
		if r.Method != http.MethodGet || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		switch r.URL.Path {
		case path + "/available-days":
			if q.Get("year") != "2026" {
				t.Errorf("wrong year: %s", r.URL.RawQuery)
			}
			switch q.Get("month") {
			case "11":
				fmt.Fprint(w, `["2026-11-29","2026-11-30"]`)
			case "12":
				fmt.Fprint(w, `["2026-12-01"]`)
			default:
				t.Errorf("unexpected month: %s", r.URL.RawQuery)
			}
		case path + "/slots":
			if q.Get("tz") != "America/Cuiaba" {
				t.Errorf("wrong time zone: %s", r.URL.RawQuery)
			}
			switch q.Get("date") {
			case "2026-11-30":
				fmt.Fprint(w, `[{"startAt":"2026-11-30T18:00:00.000Z","endAt":"2026-11-30T19:00:00.000Z"},{"startAt":"2026-11-30T16:15:00.000Z","endAt":"2026-11-30T17:15:00.000Z"}]`)
			case "2026-12-01":
				fmt.Fprint(w, `[{"startAt":"2026-12-01T13:00:00.000Z","endAt":"2026-12-01T14:00:00.000Z"},{"startAt":"2026-12-01T12:00:00.000Z","endAt":"2026-12-01T13:00:00.000Z"},{"startAt":"2026-12-01T12:00:00.000Z","endAt":"2026-12-01T13:00:00.000Z"}]`)
			default:
				t.Errorf("unexpected date: %s", r.URL.RawQuery)
			}
		default:
			t.Errorf("unexpected request path: %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	p := domain.Policy{TimeZone: "America/Cuiaba", SchedulingURL: "https://app.clickmax.io/book/workspace/agenda"}
	calendar, err := NewPublicAvailability(p)
	if err != nil || calendar.endpoint != "https://crm.clickmax.io"+path {
		t.Fatalf("public calendar: %v, %v", calendar, err)
	}
	calendar.endpoint = srv.URL + path
	var parallel sync.WaitGroup
	for range 24 {
		parallel.Go(func() {
			slots, err := calendar.Slots(context.Background(), domain.State{}, now)
			if err != nil || len(slots) != 3 {
				t.Errorf("shared slots: %v, %v", slots, err)
			}
		})
	}
	parallel.Wait()
	if reads.Load() != 4 {
		t.Fatalf("parallel offers should share one read of both dates and both months: %d", reads.Load())
	}
	slots, err := calendar.Slots(context.Background(), domain.State{}, now)
	if err != nil || len(slots) != 3 {
		t.Fatalf("slots: %v, %v", slots, err)
	}
	for i, want := range []string{"segunda-feira, 30/11, às 14h", "terça-feira, 01/12, às 8h", "terça-feira, 01/12, às 9h"} {
		slot := slots[i]
		if !domain.ValidID(slot.ID) || slot.Provider != domain.ClickMaxPublicProvider || slot.End.Sub(slot.Start) != time.Hour || domain.SlotLabel(slot, p.Zone(domain.State{})) != want {
			t.Fatalf("slot %d: %+v", i, slot)
		}
	}
	if ok, err := calendar.Available(context.Background(), domain.State{}, slots[0]); err != nil || !ok || reads.Load() != 5 {
		t.Fatalf("booking should recheck the selected day without the offer cache: %v, %v, %d", ok, err, reads.Load())
	}
}
