package calendarworker

import (
	"sdr-next-pilot/pkg/sdrsdk"
	"testing"
	"time"
)

func TestDSTOffsetsAndBuffers(t *testing.T) {
	p := sdrsdk.CalendarPolicy{Timezone: "America/New_York", Windows: []sdrsdk.CalendarWindow{{Day: 0, Start: 60, End: 240}}, Durations: []int{30}, Step: 15, Horizon: 60, Notice: 0, BufferBefore: 15, BufferAfter: 15}
	loc, _ := time.LoadLocation(p.Timezone)
	from := time.Date(2026, 11, 1, 0, 0, 0, 0, loc)
	to := from.AddDate(0, 0, 1)
	j := sdrsdk.CalendarJob{ID: "job", Now: from, Input: sdrsdk.CalendarInput{Mode: "any", From: from, To: to, Duration: 30}, Calendars: []sdrsdk.CalendarRef{{ID: "one", Policy: p}}}
	slots, _, e := Slots(j, map[string][]sdrsdk.CalendarInterval{})
	if e != nil || len(slots) < 8 {
		t.Fatal("DST availability", e, len(slots))
	}
	seen := map[time.Time]bool{}
	for _, s := range slots {
		if seen[s.Start] || s.End.Sub(s.Start) != 30*time.Minute {
			t.Fatal("DST duplicated instant or changed duration")
		}
		seen[s.Start] = true
	}
	start := time.Date(2026, 11, 1, 3, 0, 0, 0, loc)
	if Fits(j.Calendars[0], start, start.Add(30*time.Minute), from, []sdrsdk.CalendarInterval{{Start: start.Add(-20 * time.Minute), End: start.Add(-10 * time.Minute)}}) {
		t.Fatal("buffer overlap ignored")
	}
	p.Windows = []sdrsdk.CalendarWindow{{Day: 0, Start: 120, End: 240}}
	gap := time.Date(2027, 3, 14, 0, 0, 0, 0, loc)
	j.Now = gap
	j.Input.From = gap
	j.Input.To = gap.AddDate(0, 0, 1)
	j.Calendars[0].Policy = p
	slots, _, e = Slots(j, map[string][]sdrsdk.CalendarInterval{})
	if e != nil || len(slots) != 0 {
		t.Fatal("nonexistent working window silently moved", e, len(slots))
	}
}
