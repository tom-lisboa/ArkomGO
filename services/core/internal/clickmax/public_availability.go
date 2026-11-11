package clickmax

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"sync"
	"time"

	"arkom/bia/internal/domain"
	"golang.org/x/sync/singleflight"
)

var publicBookingPath = regexp.MustCompile(`^/book/([a-zA-Z0-9-]+)/([a-zA-Z0-9-]+)/?$`)

// PublicAvailability uses the anonymous availability reads of the ClickMax
// booking page. Offers share a short cache; booking always reads fresh slots.
type PublicAvailability struct {
	endpoint string
	policy   domain.Policy
	client   *http.Client
	group    singleflight.Group
	mu       sync.Mutex
	slots    []domain.Slot
	expires  time.Time
}

func NewPublicAvailability(p domain.Policy) (*PublicAvailability, error) {
	u, err := url.Parse(p.SchedulingURL)
	if err != nil || u.Scheme != "https" || u.Host != "app.clickmax.io" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("invalid ClickMax public booking URL")
	}
	match := publicBookingPath.FindStringSubmatch(u.EscapedPath())
	if match == nil {
		return nil, fmt.Errorf("invalid ClickMax public booking path")
	}
	return &PublicAvailability{
		endpoint: "https://crm.clickmax.io/public/booking/" + match[1] + "/" + match[2],
		policy:   p,
		client: &http.Client{
			Timeout: 2 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}, nil
}

func (a *PublicAvailability) Slots(ctx context.Context, _ domain.State, now time.Time) ([]domain.Slot, error) {
	readCache := func() ([]domain.Slot, bool) {
		a.mu.Lock()
		defer a.mu.Unlock()
		return a.slots, time.Now().Before(a.expires)
	}
	slots, ok := readCache()
	if !ok {
		ch := a.group.DoChan("team", func() (any, error) {
			if cached, ok := readCache(); ok {
				return cached, nil
			}
			readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			fresh, err := a.fetchSlots(readCtx, now)
			if err == nil {
				a.mu.Lock()
				a.slots, a.expires = fresh, time.Now().Add(8*time.Second)
				a.mu.Unlock()
			}
			return fresh, err
		})
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case result := <-ch:
			if result.Err != nil {
				return nil, result.Err
			}
			slots = result.Val.([]domain.Slot)
		}
	}
	// Callers filter and sort their own copy. Times are UTC and rendered in
	// the lead's timezone later.
	return slices.DeleteFunc(slices.Clone(slots), func(slot domain.Slot) bool {
		return !slot.Start.After(now.Add(30 * time.Minute))
	}), nil
}

func (a *PublicAvailability) fetchSlots(ctx context.Context, now time.Time) ([]domain.Slot, error) {
	const maxDays = 4
	zone := a.policy.Zone(domain.State{})
	local := now.In(zone)
	month := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, zone)
	today := local.Format(time.DateOnly)
	dates := make(map[string]bool)
	for i := 0; i < 2 && len(dates) < maxDays; i++ {
		m := month.AddDate(0, i, 0)
		var days []string
		err := a.get(ctx, "/available-days", url.Values{"year": {strconv.Itoa(m.Year())}, "month": {strconv.Itoa(int(m.Month()))}}, &days)
		if err != nil {
			return nil, err
		}
		for _, day := range days {
			d, err := time.Parse(time.DateOnly, day)
			if err == nil && day >= today && d.Year() == m.Year() && d.Month() == m.Month() {
				dates[day] = true
			}
		}
	}
	days := make([]string, 0, len(dates))
	for day := range dates {
		days = append(days, day)
	}
	sort.Strings(days)
	var result []domain.Slot
	seen := make(map[int64]bool)
	for _, day := range days[:min(len(days), maxDays)] {
		slots, err := a.daySlots(ctx, day, zone)
		if err != nil {
			return nil, err
		}
		for _, slot := range slots {
			unix := slot.Start.Unix()
			if seen[unix] || !slot.Start.After(now.Add(30*time.Minute)) {
				continue
			}
			seen[unix] = true
			result = append(result, slot)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Start.Before(result[j].Start) })
	return result, nil
}

func (a *PublicAvailability) Available(ctx context.Context, s domain.State, selected domain.Slot) (bool, error) {
	zone := a.policy.Zone(s)
	slots, err := a.daySlots(ctx, selected.Start.In(zone).Format(time.DateOnly), zone)
	if err != nil {
		return false, err
	}
	for _, slot := range slots {
		if slot.ID == selected.ID && slot.Start.Equal(selected.Start) && slot.End.Equal(selected.End) {
			return true, nil
		}
	}
	return false, nil
}

func (a *PublicAvailability) daySlots(ctx context.Context, day string, zone *time.Location) ([]domain.Slot, error) {
	var items []struct {
		Start time.Time `json:"startAt"`
		End   time.Time `json:"endAt"`
	}
	if err := a.get(ctx, "/slots", url.Values{"date": {day}, "tz": {zone.String()}}, &items); err != nil {
		return nil, err
	}
	slots := make([]domain.Slot, 0, len(items))
	for _, item := range items {
		if item.Start.In(zone).Format(time.DateOnly) == day && item.End.After(item.Start) {
			slots = append(slots, domain.Slot{
				ID: "clickmax-public-" + strconv.FormatInt(item.Start.Unix(), 10), Start: item.Start.UTC(),
				End: item.End.UTC(), Provider: domain.ClickMaxPublicProvider,
			})
		}
	}
	return slots, nil
}

func (a *PublicAvailability) get(ctx context.Context, path string, q url.Values, result any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.endpoint+path+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	res, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("ClickMax public availability %s returned HTTP %d", path, res.StatusCode)
	}
	const maxBody = 256 << 10
	body, err := io.ReadAll(io.LimitReader(res.Body, maxBody+1))
	if err != nil {
		return err
	}
	if len(body) > maxBody {
		return fmt.Errorf("ClickMax public availability response too large")
	}
	return json.Unmarshal(body, result)
}
