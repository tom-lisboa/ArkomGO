package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"arkom/bia/internal/domain"
	"arkom/bia/internal/providers"
	"arkom/bia/internal/voiceworker"
)

func TestOpeningStopsAfterItsExpectedBookingWasCancelled(t *testing.T) {
	for _, previous := range []string{"expected", "different", ""} {
		t.Run(previous, func(t *testing.T) {
			db := setup(t)
			now := time.Now()
			s := testState("cancelled-opening", now)
			if previous != "" {
				s.PreviousBooking = &domain.Booking{ClickMaxID: previous}
			}
			fx := domain.Effect{ID: "fx/cancelled-opening", LeadID: s.ID, Kind: "send", Purpose: "form_contact", ExpectedClickMaxBookingID: "expected", Due: now, Expires: now.Add(time.Hour)}
			publishEffects(t, db, "seed", s, fx)
			m := &countingMessenger{}
			step(t, runtimeWorker(db, now, m), true)
			want := "pending"
			if previous == "expected" {
				want = "skipped"
			}
			assertJob(t, db, fx.ID, "execution", want)
			if m.Count.Load() != 0 {
				t.Fatal("sent an opening without the expected active reservation")
			}
		})
	}
}

func TestSignedDeliveryCallbackRecordsProviderFailureWithoutResending(t *testing.T) {
	db := setup(t)
	ctx := context.Background()
	now := time.Now()
	s := testState("delivery-callback", now)
	fx := domain.Effect{ID: "fx/status", LeadID: s.ID, Kind: "send", Purpose: "form_contact", Due: now}
	publishEffects(t, db, "seed", s, fx)
	sid := "SM" + strings.Repeat("a", 32)
	account := "AC" + strings.Repeat("b", 32)
	_, err := db.Pool.Exec(ctx, `INSERT INTO bia_go.twilio_messages(id,phone,fingerprint,sid,status) VALUES($1,$2,'test',$3,'sent')`, fx.ID, s.Profile.Phone, sid)
	if err != nil {
		t.Fatal(err)
	}
	status := "undelivered"
	code := 63049
	gets, posts := 0, 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			posts++
			t.Error("a delivery callback must never send a message")
		}
		gets++
		_ = json.NewEncoder(w).Encode(providers.TwilioMessage{SID: sid, From: "whatsapp:" + voiceSender, To: "whatsapp:" + s.Profile.Phone, Status: status, ErrorCode: &code})
	}))
	defer mock.Close()
	tw := &providers.TwilioMessaging{Pool: db.Pool, Account: account, AuthToken: "test", Sender: voiceSender, BaseURL: mock.URL, Client: mock.Client()}
	srv := &voiceworker.Server{Repo: voiceworker.Repository{DB: db}, Messages: tw, Account: account, AuthToken: "test", Sender: voiceSender, PublicURL: "https://voice.example", Enabled: false}
	form := url.Values{"AccountSid": {account}, "MessageSid": {sid}, "MessageStatus": {"delivered"}}
	call := func(signed bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/voice/message-status", strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		if signed {
			r.Header.Set("X-Twilio-Signature", voiceworker.Signature("test", srv.PublicURL+"/voice/message-status", form))
		}
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		return w
	}
	if r := call(false); r.Code != 403 || gets != 0 {
		t.Fatal("unauthenticated callback reached the provider", r.Code, gets)
	}
	for range 2 {
		if r := call(true); r.Code != 204 {
			t.Fatal(r.Code, r.Body)
		}
	}
	var actual, errorCode string
	if err := db.Pool.QueryRow(ctx, `SELECT status,error_code FROM bia_go.twilio_messages WHERE id=$1`, fx.ID).Scan(&actual, &errorCode); err != nil || actual != "undelivered" || errorCode != "twilio_63049" {
		t.Fatal("accepted the callback's fabricated success instead of provider state", actual, errorCode, err)
	}
	// A late queued snapshot cannot replace a terminal receipt.
	status = "queued"
	if r := call(true); r.Code != 204 {
		t.Fatal(r.Code, r.Body)
	}
	if err := db.Pool.QueryRow(ctx, `SELECT status FROM bia_go.twilio_messages WHERE id=$1`, fx.ID).Scan(&actual); err != nil || actual != "undelivered" || posts != 0 {
		t.Fatal("terminal status downgraded or message resent", actual, posts, err)
	}
}

func TestContextWaitsForDeliveredOpeningAndStopsOnRejection(t *testing.T) {
	db := setup(t)
	ctx := context.Background()
	now := time.Now()
	s := testState("context-receipt", now)
	s.Booking = &domain.Booking{ID: "booking", Start: now.Add(time.Hour), End: now.Add(105 * time.Minute)}
	fx := domain.ContactContextSequence(s, "opening", policy(), now)[0]
	fx.Due = now
	publishEffects(t, db, "seed", s, fx)
	sid := "SM" + strings.Repeat("c", 32)
	_, err := db.Pool.Exec(ctx, `INSERT INTO bia_go.twilio_messages(id,phone,fingerprint,sid,status) VALUES('opening',$1,'test',$2,'sent')`, s.Profile.Phone, sid)
	if err != nil {
		t.Fatal(err)
	}
	status, posts := "sent", 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			posts++
		}
		fmt.Fprintf(w, `{"sid":%q,"status":%q,"from":%q,"to":%q}`, sid, status, "whatsapp:"+voiceSender, "whatsapp:"+s.Profile.Phone)
	}))
	defer mock.Close()
	tw := &providers.TwilioMessaging{Pool: db.Pool, Account: "AC" + strings.Repeat("d", 32), AuthToken: "test", Sender: voiceSender, BaseURL: mock.URL, Client: mock.Client()}
	w := runtimeWorker(db, now, &countingMessenger{})
	w.Messenger = tw
	step(t, w, true)
	assertJob(t, db, fx.ID, "execution", "pending")
	status = "undelivered"
	if _, err := db.Pool.Exec(ctx, `UPDATE bia_go.jobs SET due_at=now() WHERE id=$1`, fx.ID); err != nil {
		t.Fatal(err)
	}
	step(t, w, true)
	assertJob(t, db, fx.ID, "execution", "skipped")
	if posts != 0 {
		t.Fatal("sent context after the opening was rejected")
	}
}
