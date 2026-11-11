package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

type fakeWA struct {
	orgs      []string
	commands  []string
	fail      bool
	code      string
	expires   time.Time
	connected bool
}

func (f *fakeWA) Ensure(_ context.Context, org string) error {
	f.orgs = append(f.orgs, org)
	if f.fail {
		return errors.New("private upstream failure must stay private")
	}
	return nil
}
func (f *fakeWA) Status(_ context.Context, org string) (WhatsAppView, error) {
	if f.connected {
		return WhatsAppView{Status: "connected"}, nil
	}
	return WhatsAppView{Status: "disconnected"}, nil
}
func (f *fakeWA) Command(_ context.Context, org, key, kind, phone string) error {
	f.commands = append(f.commands, org+":"+key+":"+kind)
	return nil
}
func (f *fakeWA) Result(_ context.Context, org, key string) (WhatsAppView, error) {
	v := WhatsAppView{OperationStatus: "done"}
	if f.code != "" {
		v.PairingCode = f.code
		v.ExpiresAt = &f.expires
	}
	return v, nil
}
func TestWhatsAppWorkerIsolatedIdempotentAndSecretless(t *testing.T) {
	a, keys, _ := storedApp(t)
	engine := &fakeWA{code: "1234-5678", expires: time.Now().Add(time.Minute)}
	a.wa = engine
	login := func(company, role string) string {
		code, b := req(a, "POST", "/__test/ui/login", "", "", map[string]any{"company": company, "role": role, "access_code": keys[company+"."+role]})
		if code != 200 {
			t.Fatal(code, b)
		}
		return b["access_token"].(string)
	}
	alfa := login("alfa", "operator")
	beta := login("beta", "operator")
	viewer := login("alfa", "viewer")
	code, _ := req(a, "POST", "/v1/sdr/whatsapp/connect", viewer, "deny", map[string]any{"method": "qr"})
	if code != 403 {
		t.Fatal("viewer allowed", code)
	}
	body := map[string]any{"method": "phone", "phone": "+55 (11) 99999-9999"}
	code, b := req(a, "POST", "/v1/sdr/whatsapp/connect", alfa, "phone1", body)
	if code != 202 {
		t.Fatal(code, b)
	}
	op := b["operation_id"]
	code, b = req(a, "POST", "/v1/sdr/whatsapp/connect", alfa, "phone1", body)
	if code != 202 || b["duplicate"] != true || b["operation_id"] != op {
		t.Fatal("duplicate command", code, b)
	}
	code, _ = req(a, "POST", "/v1/sdr/whatsapp/connect", alfa, "phone2", body)
	if code != 409 {
		t.Fatal("parallel pairing allowed", code)
	}
	if err := a.WhatsAppTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(engine.commands) != 1 || !strings.HasPrefix(engine.commands[0], "org_demo_alfa:") {
		t.Fatal("cross-tenant worker", engine.commands)
	}
	code, b = req(a, "GET", "/v1/sdr/whatsapp", alfa, "", nil)
	if code != 200 || b["pairing_code"] != "1234-5678" {
		t.Fatal(code, b)
	}
	_, b = req(a, "GET", "/v1/sdr/whatsapp", beta, "", nil)
	if b["pairing_code"] != nil {
		t.Fatal("pairing leak", b)
	}
	if err := a.WhatsAppTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, b = req(a, "GET", "/v1/sdr/whatsapp", alfa, "", nil)
	if b["pairing_code"] != "1234-5678" {
		t.Fatal("poll lost code", b)
	}
	engine.connected = true
	if err := a.WhatsAppTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, b = req(a, "GET", "/v1/sdr/whatsapp", alfa, "", nil)
	if b["status"] != "connected" || b["pairing_code"] != nil {
		t.Fatal("connected exposes pairing", b)
	}
	var raw string
	if err := a.db.QueryRow("SELECT coalesce(group_concat(reason,''),'') FROM audit").Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(raw, "1234-5678") || strings.Contains(raw, "5511999999999") {
		t.Fatal("sensitive audit")
	}
}
func TestWhatsAppExpiryRetryAndRestart(t *testing.T) {
	a, keys, path := storedApp(t)
	engine := &fakeWA{fail: true}
	a.wa = engine
	tok := login(t, a, keys, "alfa.operator")
	code, _ := req(a, "POST", "/v1/sdr/whatsapp/connect", tok, "qr1", map[string]any{"method": "qr"})
	if code != 202 {
		t.Fatal(code)
	}
	if err := a.WhatsAppTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, b := req(a, "GET", "/v1/sdr/whatsapp", tok, "", nil)
	if b["provisioning"] != "retrying" {
		t.Fatal(b)
	}
	a.Close()
	restart, _, err := newApp(path)
	if err != nil {
		t.Fatal(err)
	}
	defer restart.Close()
	restart.wa = engine
	engine.fail = false
	if err = restart.WhatsAppTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	var state string
	if err = restart.db.QueryRow("SELECT status FROM whatsapp_jobs WHERE idempotency_key='qr1'").Scan(&state); err != nil || state != "done" {
		t.Fatal("job lost on restart", state, err)
	}
	past := time.Now().Add(-time.Second)
	v := publicWA(WhatsAppView{Status: "pair_code", PairingCode: "SECRET", QRDataURL: "SECRET", ExpiresAt: &past}, time.Now())
	raw, _ := json.Marshal(v)
	if strings.Contains(string(raw), "SECRET") || v.Status != "expired" {
		t.Fatal("expired material exposed")
	}
}
func TestWhatsAppValidationAndRollback(t *testing.T) {
	a, keys, _ := storedApp(t)
	a.wa = &fakeWA{}
	tok := login(t, a, keys, "alfa.operator")
	code, _ := req(a, "POST", "/v1/sdr/whatsapp/connect", tok, "bad", map[string]any{"method": "phone", "phone": "bad"})
	if code != 422 {
		t.Fatal(code)
	}
	_, err := a.db.Exec(`CREATE TRIGGER fail_wa_audit BEFORE INSERT ON audit WHEN NEW.action='whatsapp.qr.requested' BEGIN SELECT RAISE(ABORT,'injected'); END`)
	if err != nil {
		t.Fatal(err)
	}
	code, _ = req(a, "POST", "/v1/sdr/whatsapp/connect", tok, "qr", map[string]any{"method": "qr"})
	if code != 503 {
		t.Fatal(code)
	}
	var n int
	err = a.db.QueryRow("SELECT count(*) FROM whatsapp_jobs").Scan(&n)
	if err != nil || n != 0 {
		t.Fatal("partial queue transaction", n, err)
	}
}

func TestViewerCannotReadPairingMaterial(t *testing.T) {
	a, keys, _ := storedApp(t)
	a.wa = &fakeWA{}
	op := login(t, a, keys, "alfa.operator")
	viewer := login(t, a, keys, "alfa.viewer")
	future := time.Now().Add(time.Minute)
	raw, _ := json.Marshal(WhatsAppView{Status: "pair_code", PairingCode: "PRIVATE-CODE", QRDataURL: "data:image/png;base64,PRIVATE", ExpiresAt: &future})
	_, err := a.db.Exec("UPDATE whatsapp_channels SET provisioning='ready',view=? WHERE organization_id='org_demo_alfa'", raw)
	if err != nil {
		t.Fatal(err)
	}
	_, b := req(a, "GET", "/v1/sdr/whatsapp", op, "", nil)
	if b["pairing_code"] != "PRIVATE-CODE" {
		t.Fatal("operator lost code")
	}
	_, b = req(a, "GET", "/v1/sdr/whatsapp", viewer, "", nil)
	if b["pairing_code"] != nil || b["qr_data_url"] != nil {
		t.Fatal("viewer can link a device", b)
	}
}
