package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/providers"
	"arkom/bia/internal/schedulingworker"
	"arkom/bia/internal/store"
	"github.com/jackc/pgx/v5"
)

const loadSchedule = "40000000-0000-4000-8000-000000000001"

type simulatedCalendar struct {
	mu                        sync.Mutex
	byContact, byID           map[string]clickmax.Appointment
	occupied                  map[string]bool
	collision, loseResponses  bool
	creates, updates, rejects int
	lost, repeatedWrites      int
}

func loadUUID(kind, n int) string {
	return fmt.Sprintf("%08x-0000-4000-8000-%012d", kind, n)
}

func loadPhone(n int) string { return fmt.Sprintf("+556599%07d", n) }

func loadContactNumber(id string) int {
	if !clickmax.ValidID(id) {
		return 0
	}
	n, _ := strconv.Atoi(id[24:])
	return n
}

func (f *simulatedCalendar) seller(n int) string {
	if f.collision && n == 3 {
		n = 1
	}
	return loadUUID(2, n%64+1)
}

func occupiedKey(a clickmax.Appointment) string {
	return a.AttendantID + "/" + a.Start.Format(time.RFC3339)
}

func (f *simulatedCalendar) store(a clickmax.Appointment) {
	f.byContact[a.ContactID], f.byID[a.ID] = a, a
	f.occupied[occupiedKey(a)] = true
}

func (f *simulatedCalendar) RoundTrip(r *http.Request) (*http.Response, error) {
	route := r.URL.Path
	write := route == "/api/v0/scheduled-calls/create" || route == "/api/v0/scheduled-calls/update"
	delay := 25 * time.Millisecond
	if write {
		delay = 60 * time.Millisecond
	}
	select {
	case <-r.Context().Done():
		return nil, r.Context().Err()
	case <-time.After(delay):
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	status, body := 200, any(nil)
	switch route {
	case "/api/v0/leads/search":
		var search struct {
			Filters []struct{ ValueString string }
		}
		if err := json.NewDecoder(r.Body).Decode(&search); err != nil || len(search.Filters) != 1 {
			return nil, fmt.Errorf("unexpected contact search")
		}
		n, err := strconv.Atoi(search.Filters[0].ValueString[1:])
		if err != nil || n == 0 {
			return nil, fmt.Errorf("unexpected contact number")
		}
		body = map[string]any{"data": []clickmax.Contact{{ID: loadUUID(1, n), Phone: loadPhone(n)}}, "meta": map[string]int{"countItens": 1}}
	case "/api/v0/scheduled-calls/list":
		data := []clickmax.Appointment{}
		if a, ok := f.byContact[r.URL.Query().Get("leadId")]; ok {
			data = append(data, a)
		}
		body = map[string]any{"data": data}
	case "/api/v0/scheduled-calls/get":
		a, ok := f.byID[r.URL.Query().Get("id")]
		if !ok {
			status = 404
		}
		body = a
	case "/api/v0/scheduled-calls/create", "/api/v0/scheduled-calls/update":
		var req clickmax.Appointment
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return nil, err
		}
		a := req
		if route == "/api/v0/scheduled-calls/update" {
			old, ok := f.byID[req.ID]
			if !ok {
				return nil, fmt.Errorf("updated nonexistent appointment")
			}
			a = old
			a.Start, a.End = req.Start, req.End
			if old.Start.Equal(a.Start) {
				f.repeatedWrites++
			}
			f.updates++
		} else {
			n := loadContactNumber(req.ContactID)
			if n == 0 || req.ScheduleID != loadSchedule || req.AttendantID != "" {
				return nil, fmt.Errorf("invalid team appointment")
			}
			if _, exists := f.byContact[req.ContactID]; exists {
				f.repeatedWrites++
				return nil, fmt.Errorf("duplicate remote create")
			}
			a.ID, a.AttendantID, a.Status = loadUUID(3, n), f.seller(n), "scheduled"
			f.creates++
		}
		if f.occupied[occupiedKey(a)] {
			f.rejects++
			status, body = 409, map[string]string{"code": "scheduling_time_conflict"}
			break
		}
		if old, ok := f.byContact[a.ContactID]; ok {
			delete(f.occupied, occupiedKey(old))
		}
		a.UpdatedAt = time.Now().UTC().Truncate(time.Microsecond)
		f.store(a)
		if f.loseResponses && loadContactNumber(a.ContactID)%19 == 0 {
			f.lost++
			return nil, io.ErrUnexpectedEOF
		}
		body = a
	default:
		return nil, fmt.Errorf("unmocked ClickMax route: %s", route)
	}
	raw, err := json.Marshal(body)
	return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(raw)), Request: r}, err
}

type loadAvailability struct{}

func (loadAvailability) Available(ctx context.Context, _ domain.State, _ domain.Slot) (bool, error) {
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	case <-time.After(25 * time.Millisecond):
		return true, nil
	}
}

func (loadAvailability) Slots(context.Context, domain.State, time.Time) ([]domain.Slot, error) {
	return nil, nil
}

func TestClickMaxSchedulingLoad(t *testing.T) {
	dsn := os.Getenv("BIA_SCHEDULING_LOAD_DB")
	if dsn == "" {
		t.Skip("set BIA_SCHEDULING_LOAD_DB to a disposable local database")
	}
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme != "postgres" || u.Hostname() != "127.0.0.1" || !strings.HasPrefix(u.Path, "/arkom_bia_load_") || u.Query().Get("host") != "" {
		t.Fatal("load test requires a disposable local arkom_bia_load_* database")
	}
	ctx := context.Background()
	db, err := store.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name           string
		leads, workers int
		resilience     bool
		sendCap        int
	}{
		{"200_leads_1_worker", 200, 1, false, 0},
		{"200_leads_2_workers", 200, 2, false, 0},
		{"200_leads_4_workers", 200, 4, false, 0},
		{"200_leads_8_workers", 200, 8, false, 0},
		{"1500_leads_8_workers", 1500, 8, false, 0},
		{"3000_leads_8_workers", 3000, 8, false, 0},
		{"400_leads_replay_contention_and_lost_responses", 400, 8, true, 0},
		{"400_leads_2_workers_cap_300", 400, 2, false, 300},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := db.Pool.Exec(ctx, `TRUNCATE bia_go.leads,bia_go.slots,bia_go.clickmax_public_closers CASCADE`); err != nil {
				t.Fatal(err)
			}
			fake := &simulatedCalendar{byContact: map[string]clickmax.Appointment{}, byID: map[string]clickmax.Appointment{},
				occupied: map[string]bool{}, collision: tc.resilience, loseResponses: tc.resilience}
			now := time.Now().UTC()
			w := runtimeWorker(db, now, &countingMessenger{})
			w.Now = nil
			w.GlobalHourly = tc.leads * 4 // measure scheduling independently of the WhatsApp send cap
			if tc.sendCap > 0 {
				w.GlobalHourly = tc.sendCap
			}
			w.Policy.ClickMaxPublicBooking, w.Policy.MeetingReminders, w.Policy.MeetingStart, w.Policy.SMSReminders, w.Policy.MeetingCheckins = true, true, true, true, true
			db.DualCalendar = true
			client, err := clickmax.New("cxd_disposableloadkey")
			if err != nil {
				t.Fatal(err)
			}
			client.HTTP.Transport = fake
			sw := schedulingworker.New(*w, &providers.LocalCalendar{Pool: db.Pool})
			sw.ClickMax = &schedulingworker.ClickMaxPublic{DB: db, Client: client, ScheduleID: loadSchedule, PipelineID: loadUUID(4, 1), Availability: loadAvailability{}}
			seedLoad(t, db, fake, w.Policy, now, tc.leads, tc.resilience)
			quotaWait := 0
			if tc.sendCap > 0 {
				quotaWait = max(tc.leads-tc.sendCap, 0)
			}
			started, elapsed := runLoad(t, db, sw, tc.workers, quotaWait)
			expected := tc.leads
			if tc.resilience {
				expected--
			}
			auditLoad(t, db, fake, w.Policy, started, expected, tc.leads, elapsed)
		})
	}
}

func seedLoad(t *testing.T, db *store.DB, fake *simulatedCalendar, p domain.Policy, now time.Time, leads int, replay bool) {
	t.Helper()
	ctx := context.Background()
	var batch pgx.Batch
	anchor := now.Truncate(time.Hour).Add(48 * time.Hour)
	for n := 1; n <= leads; n++ {
		s := testState(fmt.Sprintf("load-%d", n), now.Add(-time.Hour))
		s.LastInbound, s.Profile.Phone = now.Add(-time.Minute), loadPhone(n)
		s.Profile.SMSConsent, s.Profile.SMSPhone = true, s.Profile.Phone
		target := anchor.Add(time.Duration(n/64) * 2 * time.Hour)
		var originalReminders []domain.Effect
		if n%2 == 0 {
			old := target.AddDate(0, 1, 0)
			a := clickmax.Appointment{ID: loadUUID(3, n), ContactID: loadUUID(1, n), AttendantID: fake.seller(n), ScheduleID: loadSchedule,
				Start: old, End: old.Add(time.Hour), Status: "scheduled", Origin: "crm", CreatedAt: now.Add(-time.Hour), UpdatedAt: now.Add(-time.Hour)}
			fake.store(a)
			closer := int64(2000000000 + n%64)
			s.Booking = &domain.Booking{ID: "original-" + s.ID, ClickMaxID: a.ID, Start: a.Start, End: a.End, Provider: domain.ClickMaxPublicProvider, CloserID: closer}
			s.Stage = "booked"
			originalReminders = append(originalReminders, domain.MeetingSequence(s, now)...)
			originalReminders = append(originalReminders, domain.MeetingStartSequence(s, now)...)
			originalReminders = append(originalReminders, domain.SMSSequence(s, now)...)
			originalReminders = append(originalReminders, domain.MeetingCheckinSequence(s, p, now)...)
			body, _ := json.Marshal(s)
			batch.Queue(`INSERT INTO bia_go.leads(id,state) VALUES($1,$2)`, s.ID, body)
			batch.Queue(`INSERT INTO bia_go.clickmax_public_closers(attendant_id,closer_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, a.AttendantID, closer)
			batch.Queue(`INSERT INTO bia_go.slots(id,starts_at,ends_at,closer_id,meeting_url,reserved_by,clickmax_public) VALUES($1,$2,$3,$4,'',$1,true)`, s.Booking.ID, a.Start, a.End, closer)
			raw, _ := json.Marshal(s.Booking)
			batch.Queue(`INSERT INTO bia_go.bookings(id,operation_id,lead_id,slot_id,payload) VALUES($1,$1,$2,$1,$3)`, s.Booking.ID, s.ID, raw)
			batch.Queue(`INSERT INTO bia_go.clickmax_public_bookings(appointment_id,contact_id,lead_id,booking_id,provider_updated_at) VALUES($1,$2,$3,$4,$5)`, a.ID, a.ContactID, s.ID, s.Booking.ID, a.UpdatedAt)
		} else {
			body, _ := json.Marshal(s)
			batch.Queue(`INSERT INTO bia_go.leads(id,state) VALUES($1,$2)`, s.ID, body)
		}
		for _, fx := range originalReminders {
			queueLoadEffect(&batch, fx)
		}
		slot := &domain.Slot{ID: fmt.Sprintf("slot-%d", n), Start: target, End: target.Add(time.Hour), Provider: domain.ClickMaxPublicProvider}
		fx := domain.Effect{ID: "fx/load-" + s.ID, LeadID: s.ID, Kind: "book", Purpose: "booking", Slot: slot, Due: now, Expires: now.Add(10 * time.Minute)}
		if s.Booking != nil {
			fx.Booking, fx.BookingID, fx.BookingStart = s.Booking, s.Booking.ID, s.Booking.Start
		}
		queueLoadEffect(&batch, fx)
		if replay && n%5 == 0 {
			queueLoadEffect(&batch, fx)
			fx.ID += "-replay"
			queueLoadEffect(&batch, fx)
		}
	}
	if err := db.Pool.SendBatch(ctx, &batch).Close(); err != nil {
		t.Fatal(err)
	}
}

func queueLoadEffect(batch *pgx.Batch, fx domain.Effect) {
	raw, _ := json.Marshal(fx)
	batch.Queue(`INSERT INTO bia_go.jobs(id,lead_id,kind,mode,payload,fingerprint,due_at)
 VALUES($1,$2,'effect','live',$3,$1,$4) ON CONFLICT(id) DO NOTHING`, fx.ID, fx.LeadID, raw, fx.Due)
}

type loadWorkerLog struct {
	stopping atomic.Bool
	errors   atomic.Int32
}

func (l *loadWorkerLog) Write(p []byte) (int, error) {
	if !l.stopping.Load() {
		l.errors.Add(1)
	}
	return len(p), nil
}

func runLoad(t *testing.T, db *store.DB, sw *schedulingworker.Worker, workers, quotaWait int) (time.Time, time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	var wg sync.WaitGroup
	log := &loadWorkerLog{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(log, &slog.HandlerOptions{Level: slog.LevelError})))
	defer func() {
		log.stopping.Store(true)
		cancel()
		wg.Wait()
		slog.SetDefault(previous)
		if n := log.errors.Load(); n > 0 {
			t.Errorf("worker errors while processing the queue: %d", n)
		}
	}()
	started := time.Now()
	quotaAdvanced := false
	for range workers {
		wg.Go(func() { sw.Run(ctx) })
	}
	tick := time.NewTicker(200 * time.Millisecond)
	defer tick.Stop()
	for {
		var pending, deferred int
		if err := db.Pool.QueryRow(ctx, `SELECT count(*),
 count(*) FILTER(WHERE status='pending' AND payload->>'purpose'='booking_confirmation' AND error_code='send_rate_limit' AND attempts=0 AND due_at>now()+interval '55 minutes')
 FROM bia_go.jobs WHERE queue='scheduling' AND status IN ('pending','running')`).Scan(&pending, &deferred); err != nil {
			t.Fatal(err)
		}
		if pending == 0 {
			if quotaWait > 0 && !quotaAdvanced {
				t.Fatal("expected confirmations to wait for the quota window")
			}
			return started, time.Since(started)
		}
		if quotaWait > 0 && !quotaAdvanced && pending == quotaWait && deferred == quotaWait {
			advanceLoadQuota(t, ctx, db, quotaWait)
			quotaAdvanced = true
		}
		select {
		case <-ctx.Done():
			t.Fatalf("load did not drain: %d scheduling jobs pending", pending)
		case <-tick.C:
		}
	}
}

func advanceLoadQuota(t *testing.T, ctx context.Context, db *store.DB, waiting int) {
	t.Helper()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	sent, err := tx.Exec(ctx, `UPDATE bia_go.jobs
 SET result=jsonb_set(result,'{load_original_completed_at}',to_jsonb(completed_at)), completed_at=completed_at-interval '1 hour'
 WHERE status='done' AND payload->>'purpose'='booking_confirmation'`)
	if err != nil {
		t.Fatal(err)
	}
	released, err := tx.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now()
 WHERE status='pending' AND error_code='send_rate_limit' AND payload->>'purpose'='booking_confirmation'`)
	if err != nil || released.RowsAffected() != int64(waiting) {
		t.Fatalf("advance simulated quota: %v, %v", released, err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	t.Logf("QUOTA confirmed=%d queued_without_attempts=%d; advanced the simulated hourly window", sent.RowsAffected(), waiting)
}

func auditLoad(t *testing.T, db *store.DB, fake *simulatedCalendar, p domain.Policy, now time.Time, expected, leads int, elapsed time.Duration) {
	t.Helper()
	ctx := context.Background()
	for range 2 {
		for _, run := range []func(context.Context, time.Time, bool) error{
			db.ReconcileMeetingStart, db.ReconcileMeetingReminders, db.ReconcileSMSReminders,
		} {
			if err := run(ctx, now, true); err != nil {
				t.Fatal(err)
			}
		}
		if err := db.ReconcileProactive(ctx, now, true, p); err != nil {
			t.Fatal(err)
		}
	}
	var active, total, remoteDuplicate, stale, wrongDue, duplicateReminders, incomplete, wrongWindows, failures, confirmations, limited int
	err := db.Pool.QueryRow(ctx, `WITH reminders AS (
 SELECT b.id, b.cancelled_at, j.payload->>'purpose' AS purpose, j.due_at, s.starts_at FROM bia_go.jobs j
 JOIN bia_go.bookings b ON b.id=j.payload->>'booking_id' JOIN bia_go.slots s ON s.id=b.slot_id
 WHERE j.status='pending' AND j.payload->>'purpose' IN ('meeting_audio','meeting_call','meeting_sms','meeting_start','meeting_checkin_24h','meeting_checkin_2h','meeting_checkin_1h','meeting_checkin_5m','meeting_checkin_7m_after')
 ), aggregate AS (SELECT id,count(*) AS n FROM reminders WHERE cancelled_at IS NULL GROUP BY id)
 SELECT (SELECT count(*) FROM bia_go.bookings WHERE cancelled_at IS NULL),
 (SELECT count(*) FROM bia_go.bookings),
 (SELECT count(*) FROM (SELECT payload->>'clickmax_id' FROM bia_go.bookings WHERE cancelled_at IS NULL GROUP BY 1 HAVING count(*)>1) d),
 (SELECT count(*) FROM reminders WHERE cancelled_at IS NOT NULL),
 (SELECT count(*) FROM reminders WHERE due_at <> starts_at + CASE purpose
   WHEN 'meeting_audio' THEN interval '-30 minutes' WHEN 'meeting_call' THEN interval '-15 minutes'
   WHEN 'meeting_sms' THEN interval '-5 minutes' WHEN 'meeting_checkin_5m' THEN interval '-5 minutes'
   WHEN 'meeting_checkin_24h' THEN interval '-24 hours' WHEN 'meeting_checkin_2h' THEN interval '-2 hours' WHEN 'meeting_checkin_1h' THEN interval '-1 hour'
   WHEN 'meeting_checkin_7m_after' THEN interval '7 minutes' ELSE interval '0 minutes' END),
 (SELECT count(*) FROM (SELECT id,purpose FROM reminders GROUP BY id,purpose HAVING count(*)>1) d),
 (SELECT count(*) FROM bia_go.bookings b LEFT JOIN aggregate a ON a.id=b.id WHERE b.cancelled_at IS NULL AND COALESCE(a.n,0)<>8),
 (SELECT count(*) FROM bia_go.bookings b JOIN bia_go.jobs j ON j.id='fx/load-'||b.lead_id JOIN bia_go.slots s ON s.id=b.slot_id WHERE b.cancelled_at IS NULL AND (s.starts_at,s.ends_at) IS DISTINCT FROM ((j.payload#>>'{slot,start}')::timestamptz,(j.payload#>>'{slot,end}')::timestamptz)),
 (SELECT count(*) FROM bia_go.jobs WHERE queue='scheduling' AND status IN ('dead','uncertain')),
 (SELECT count(*) FROM bia_go.jobs WHERE status='done' AND payload->>'purpose'='booking_confirmation'),
 (SELECT count(*) FROM bia_go.jobs WHERE status='dead' AND error_code='send_rate_limit' AND payload->>'purpose'='booking_confirmation')`).
		Scan(&active, &total, &remoteDuplicate, &stale, &wrongDue, &duplicateReminders, &incomplete, &wrongWindows, &failures, &confirmations, &limited)
	if err != nil {
		t.Fatal(err)
	}
	var p50, p95, p99 float64
	err = db.Pool.QueryRow(ctx, `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency),
 percentile_cont(0.95) WITHIN GROUP (ORDER BY latency), percentile_cont(0.99) WITHIN GROUP (ORDER BY latency)
 FROM (SELECT extract(epoch FROM (COALESCE((result->>'load_original_completed_at')::timestamptz,completed_at)-$1::timestamptz)) AS latency
 FROM bia_go.jobs WHERE status='done' AND payload->>'purpose'='booking_confirmation') sent`, now).Scan(&p50, &p95, &p99)
	if err != nil {
		t.Fatal(err)
	}
	var lastMutation float64
	err = db.Pool.QueryRow(ctx, `SELECT extract(epoch FROM (max(completed_at)-$1::timestamptz))
 FROM bia_go.jobs WHERE status='done' AND payload->>'kind'='book'`, now).Scan(&lastMutation)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("LOAD leads=%d confirmed=%d duration=%.2fs rate=%.2f/s p50=%.2fs p95=%.2fs p99=%.2fs last_mutation=%.2fs provider_creates=%d provider_updates=%d conflicts=%d lost_responses=%d repeated_writes=%d active_reminders=%d duplicate_reservations=%d duplicate_reminders=%d stale_reminders=%d incorrect_reminder_times=%d incomplete_reminder_sets=%d wrong_booking_windows=%d failed_jobs=%d rate_limited_confirmations=%d",
		leads, confirmations, elapsed.Seconds(), float64(confirmations)/elapsed.Seconds(), p50, p95, p99, lastMutation, fake.creates, fake.updates, fake.rejects, fake.lost, fake.repeatedWrites, active*9, remoteDuplicate, duplicateReminders, stale, wrongDue, incomplete, wrongWindows, failures, limited)
	if active != expected || total != expected+leads/2 || len(fake.byContact) != expected ||
		fake.creates != leads/2 || fake.updates != leads/2 || fake.rejects != leads-expected ||
		fake.repeatedWrites+remoteDuplicate+stale+wrongDue+duplicateReminders+incomplete+wrongWindows != 0 ||
		limited != 0 || failures != 0 || confirmations != expected {
		t.Fatalf("audit failed: active=%d total=%d remote=%d", active, total, len(fake.byContact))
	}
}
