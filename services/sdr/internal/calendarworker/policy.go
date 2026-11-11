package calendarworker

import (
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sort"
	"sync"
	"time"
)

var calendarZones sync.Map

func calendarLocation(name string) (*time.Location, error) {
	if v, ok := calendarZones.Load(name); ok {
		return v.(*time.Location), nil
	}
	loc, e := time.LoadLocation(name)
	if e == nil {
		calendarZones.Store(name, loc)
	}
	return loc, e
}

func ValidatePolicy(p sdrsdk.CalendarPolicy) error {
	if _, e := calendarLocation(p.Timezone); e != nil {
		return errors.New("invalid_timezone")
	}
	if len(p.Windows) < 1 || len(p.Windows) > 28 || len(p.Durations) < 1 || len(p.Durations) > 12 || len(p.BlockedDates) > 366 || p.Step < 5 || p.Step > 120 || p.BufferBefore < 0 || p.BufferBefore > 240 || p.BufferAfter < 0 || p.BufferAfter > 240 || p.Notice < 0 || p.Notice > 10080 || p.Horizon < 1 || p.Horizon > 180 {
		return errors.New("invalid_calendar_policy")
	}
	for _, d := range p.Durations {
		if d < 5 || d > 240 {
			return errors.New("invalid_duration")
		}
	}
	for i, w := range p.Windows {
		if w.Day < 0 || w.Day > 6 || w.Start < 0 || w.End > 1440 || w.Start >= w.End {
			return errors.New("invalid_working_window")
		}
		for _, other := range p.Windows[:i] {
			if w.Day == other.Day && w.Start < other.End && other.Start < w.End {
				return errors.New("overlapping_working_windows")
			}
		}
	}
	for _, day := range p.BlockedDates {
		if _, e := time.Parse("2006-01-02", day); e != nil {
			return errors.New("invalid_blocked_date")
		}
	}
	return nil
}
func Allowed(p sdrsdk.CalendarPolicy, start, end, now time.Time) bool {
	if ValidatePolicy(p) != nil || !end.After(start) || start.Before(now.Add(time.Duration(p.Notice)*time.Minute)) || start.After(now.AddDate(0, 0, p.Horizon)) || !slices.Contains(p.Durations, int(end.Sub(start)/time.Minute)) || end.Sub(start)%time.Minute != 0 {
		return false
	}
	loc, _ := calendarLocation(p.Timezone)
	s, e := start.In(loc), end.In(loc)
	if slices.Contains(p.BlockedDates, s.Format("2006-01-02")) {
		return false
	}
	for _, w := range p.Windows {
		if int(s.Weekday()) != w.Day {
			continue
		}
		open, close, valid := windowBounds(s, w, loc)
		if !valid {
			continue
		}
		if !s.Before(open) && !e.After(close) && s.Second() == 0 && s.Nanosecond() == 0 && int(s.Sub(open)/time.Minute)%p.Step == 0 {
			return true
		}
	}
	return false
}
func windowBounds(day time.Time, w sdrsdk.CalendarWindow, loc *time.Location) (time.Time, time.Time, bool) {
	open := time.Date(day.Year(), day.Month(), day.Day(), w.Start/60, w.Start%60, 0, 0, loc)
	close := time.Date(day.Year(), day.Month(), day.Day(), w.End/60, w.End%60, 0, 0, loc)
	valid := open.Hour()*60+open.Minute() == w.Start && close.Hour()*60+close.Minute() == w.End%1440 && close.After(open)
	return open, close, valid
}
func Overlap(a, b sdrsdk.CalendarInterval) bool {
	return a.Start.Before(b.End) && b.Start.Before(a.End)
}
func Fits(ref sdrsdk.CalendarRef, start, end, now time.Time, busy []sdrsdk.CalendarInterval) bool {
	if !Allowed(ref.Policy, start, end, now) {
		return false
	}
	span := sdrsdk.CalendarInterval{Start: start.Add(-time.Duration(ref.Policy.BufferBefore) * time.Minute), End: end.Add(time.Duration(ref.Policy.BufferAfter) * time.Minute)}
	for _, b := range busy {
		if Overlap(span, b) {
			return false
		}
	}
	return true
}
func Slots(j sdrsdk.CalendarJob, busy map[string][]sdrsdk.CalendarInterval) ([]sdrsdk.CalendarSlot, bool, error) {
	q := j.Input
	if len(j.Calendars) < 1 || len(j.Calendars) > 8 || !q.To.After(q.From) || q.To.Sub(q.From) > 31*24*time.Hour || q.Duration < 5 || q.Duration > 240 || (q.Mode != "all" && q.Mode != "any") {
		return nil, false, errors.New("invalid_availability_query")
	}
	for _, c := range j.Calendars {
		if ValidatePolicy(c.Policy) != nil {
			return nil, false, errors.New("invalid_calendar_policy")
		}
	}
	out := []sdrsdk.CalendarSlot{}
	for index, c := range j.Calendars {
		if q.Mode == "all" && index > 0 {
			break
		}
		loc, _ := calendarLocation(c.Policy.Timezone)
		first := q.From.In(loc)
		day := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, loc)
		collected := 0
	calendarSearch:
		for n := 0; n < 33 && !day.After(q.To); n++ {
			for _, w := range c.Policy.Windows {
				if int(day.Weekday()) != w.Day {
					continue
				}
				open, close, valid := windowBounds(day, w, loc)
				if !valid {
					continue
				}
				for start := open; start.Before(close); start = start.Add(time.Duration(c.Policy.Step) * time.Minute) {
					end := start.Add(time.Duration(q.Duration) * time.Minute)
					if start.Before(q.From) || end.After(q.To) || !Fits(c, start, end, j.Now, busy[c.ID]) {
						continue
					}
					checked := []string{c.ID}
					valid := true
					if q.Mode == "all" {
						for _, other := range j.Calendars[1:] {
							if !Fits(other, start, end, j.Now, busy[other.ID]) {
								valid = false
								break
							}
							checked = append(checked, other.ID)
						}
					}
					if valid {
						out = append(out, sdrsdk.CalendarSlot{ID: "slot_" + sdrsdk.Digest([]any{j.ID, c.ID, checked, start.UTC(), end.UTC()})[:32], CalendarID: c.ID, CheckedIDs: checked, Start: start, End: end, Timezone: c.Policy.Timezone})
						collected++
						if collected >= 201 {
							break calendarSearch
						}
					}
				}
			}
			day = day.AddDate(0, 0, 1)
		}
	}
	sort.Slice(out, func(i, k int) bool {
		if out[i].Start.Equal(out[k].Start) {
			return out[i].CalendarID < out[k].CalendarID
		}
		return out[i].Start.Before(out[k].Start)
	})
	limited := len(out) > 200
	if limited {
		out = out[:200]
	}
	return out, limited, nil
}
