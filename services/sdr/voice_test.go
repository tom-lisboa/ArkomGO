package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"sdr-next-pilot/internal/voicecall"
)

type voiceHTTPFunc func(*http.Request) (*http.Response, error)

func (f voiceHTTPFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestTenantVoiceRequiresNativeConsentAndKeepsKeysPrivate(t *testing.T) {
	a, credentials, err := newApp(filepath.Join(t.TempDir(), "voice.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	a.voice, err = newVoiceService("https://voice.example.com/sdr-next", bytes.Repeat([]byte{9}, 32))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	a.now = func() time.Time { return now }
	account, senderSID, template := "AC"+strings.Repeat("a", 32), "XE"+strings.Repeat("b", 32), "HX"+strings.Repeat("c", 32)
	secret, aiKey := strings.Repeat("d", 32), "sk-tenant-example-private-testing"
	phone, sender := "+5511999999998", "+5511999999997"
	permissionID, acceptID, callSID := "MM"+strings.Repeat("e", 32), "SM"+strings.Repeat("f", 32), "CA"+strings.Repeat("a", 32)
	alpha := login(t, a, credentials, "alfa.admin")
	beta := login(t, a, credentials, "beta.admin")
	viewer := login(t, a, credentials, "alfa.viewer")
	configBody := map[string]any{
		"expected_revision": 0, "account_sid": account, "sender_sid": senderSID, "template_sid": template, "test_phone": phone,
		"twilio_auth_token": secret, "openai_api_key": aiKey,
		"profile": map[string]any{"name": "Atendente Alfa", "greeting": "Bom dia", "instructions": "Confirme o interesse.", "model": "gpt-realtime-mini", "voice": "marin", "max_seconds": 60},
	}
	if code, _ := req(a, "POST", "/v1/sdr/voice/config", viewer, "", configBody); code != 403 {
		t.Fatal(code)
	}
	code, view := req(a, "POST", "/v1/sdr/voice/config", alpha, "", configBody)
	if code != 200 || view["enabled"] != false {
		t.Fatal(code, view)
	}
	var raw []byte
	if err = a.db.QueryRow("SELECT payload FROM state_snapshot WHERE id=1").Scan(&raw); err != nil ||
		bytes.Contains(raw, []byte(secret)) || bytes.Contains(raw, []byte(aiKey)) {
		t.Fatal("credential was not sealed", err)
	}
	encoded, _ := json.Marshal(view)
	if bytes.Contains(encoded, []byte(secret)) || bytes.Contains(encoded, []byte(aiKey)) {
		t.Fatal("credential in response")
	}
	config := a.state.Voice.Configs["org_demo_alfa"]
	if _, err = a.voice.open("org_demo_beta", config); err == nil {
		t.Fatal("credential envelope decrypted for another tenant")
	}

	a.voice.verifyModel = func(_ context.Context, key, model string) error {
		if key != aiKey || model != "gpt-realtime-mini" {
			t.Fatal("wrong tenant model configuration")
		}
		return nil
	}
	var permissions, dials int
	a.voice.http.Transport = voiceHTTPFunc(func(r *http.Request) (*http.Response, error) {
		if name, token, ok := r.BasicAuth(); !ok || name != account || token != secret {
			t.Fatal("wrong Twilio tenant credentials")
		}
		var data any
		switch {
		case r.URL.Host == "messaging.twilio.com":
			data = map[string]any{"sid": senderSID, "status": "ONLINE", "sender_id": "whatsapp:" + sender, "configuration": map[string]string{"voice_application_sid": "AP" + strings.Repeat("f", 32)}, "webhook": map[string]string{"callback_url": a.voice.url(config, "permission"), "callback_method": "POST"}}
		case strings.HasSuffix(r.URL.Path, "/ApprovalRequests"):
			data = map[string]any{"whatsapp": map[string]string{"status": "approved"}}
		case r.URL.Host == "content.twilio.com":
			data = map[string]any{"account_sid": account, "sid": template, "types": map[string]any{"twilio/call-to-action": map[string]any{"actions": []map[string]string{{"type": "VOICE_CALL_REQUEST"}}}}}
		case strings.HasSuffix(r.URL.Path, "/Messages.json"):
			permissions++
			if err := r.ParseForm(); err != nil || r.PostForm.Get("ContentSid") != template || r.PostForm.Get("To") != "whatsapp:"+phone {
				t.Fatal("invalid permission send")
			}
			data = map[string]string{"sid": permissionID}
		case strings.HasSuffix(r.URL.Path, "/Messages/"+acceptID+".json"):
			data = map[string]string{"sid": acceptID, "account_sid": account, "from": "whatsapp:" + phone, "to": "whatsapp:" + sender, "body": "VOICE_CALL_REQUEST", "date_created": now.Format(time.RFC1123Z)}
		case strings.HasSuffix(r.URL.Path, "/Calls.json"):
			dials++
			if err := r.ParseForm(); err != nil || r.PostForm.Get("To") != "whatsapp:"+phone || r.PostForm.Get("TimeLimit") != "60" {
				t.Fatal("invalid call request")
			}
			data = map[string]string{"sid": callSID}
		default:
			t.Fatal("unexpected provider request", r.URL.Host, r.URL.Path)
		}
		raw, _ := json.Marshal(data)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Header: http.Header{}}, nil
	})
	if code, view = req(a, "POST", "/v1/sdr/voice/activate", alpha, "", map[string]int{"expected_revision": 1}); code != 200 || view["enabled"] != true {
		t.Fatal(code, view)
	}
	if code, _ = req(a, "POST", "/v1/sdr/voice/calls", beta, "test-beta", map[string]bool{"test": true}); code != 409 {
		t.Fatal(code)
	}
	code, queued := req(a, "POST", "/v1/sdr/voice/calls", alpha, "voice-call", map[string]bool{"test": true})
	if code != 202 {
		t.Fatal(code, queued)
	}
	id := queued["id"].(string)
	if code, replay := req(a, "POST", "/v1/sdr/voice/calls", alpha, "voice-call", map[string]bool{"test": true}); code != 202 || replay["id"] != id {
		t.Fatal(code, replay)
	}
	if code, _ := req(a, "GET", "/v1/sdr/voice/calls/"+id, beta, "", nil); code != 404 {
		t.Fatal(code)
	}
	tick := func() {
		t.Helper()
		if e := a.voiceTick(context.Background()); e != nil {
			t.Fatal(e)
		}
	}
	tick()
	tick()
	if permissions != 1 || dials != 0 {
		t.Fatal("dialed without native authorization", permissions, dials)
	}

	post := func(kind string, form url.Values, signing bool) *httptest.ResponseRecorder {
		t.Helper()
		path := "/" + voicePath + "/twilio/" + config.ID + "/" + kind
		r := httptest.NewRequest("POST", path, strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		if signing {
			r.Header.Set("X-Twilio-Signature", voicecall.Signature(secret, a.voice.public+path, form))
		}
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		return w
	}
	form := url.Values{"AccountSid": {account}, "From": {"whatsapp:" + phone}, "To": {"whatsapp:" + sender}, "Body": {"VOICE_CALL_REQUEST"}, "ButtonPayload": {"ACCEPTED"}, "MessageSid": {acceptID}, "OriginalRepliedMessageSid": {permissionID}}
	if response := post("permission", form, false); response.Code != 403 {
		t.Fatal(response.Code)
	}
	tick()
	if dials != 0 {
		t.Fatal("forged authorization dialed")
	}
	if response := post("permission", form, true); response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	if response := post("permission", form, true); response.Code != 200 {
		t.Fatal(response.Code)
	}
	tick()
	tick()
	if dials != 1 {
		t.Fatal("duplicate or missing call", dials)
	}
	answerForm := url.Values{"AccountSid": {account}, "From": {"whatsapp:" + sender}, "To": {"whatsapp:" + phone}, "CallSid": {callSID}}
	if response := post("answer/"+id, answerForm, true); response.Code != 200 || !strings.Contains(response.Body.String(), "/stream/"+id) || strings.Contains(response.Body.String(), aiKey) {
		t.Fatal(response.Code, response.Body.String())
	}

	queueContact := func(id, number string) string {
		t.Helper()
		phone = number
		target := strings.TrimPrefix(number, "+") + "@s.whatsapp.net"
		const org = "org_demo_alfa"
		policy := a.state.Transport.Policies[org]
		policy.Enabled, policy.Epoch, policy.Allowed = true, "voice-test", []string{target}
		a.state.Transport.Policies[org] = policy
		a.state.Transport.Bindings[id] = realBinding{org, target, policy.Epoch}
		a.state.Conversations[id] = &Conversation{ID: id, Org: org, Channel: "whatsapp", Automation: "active"}
		code, queued := req(a, "POST", "/v1/sdr/voice/calls", alpha, id, map[string]string{"conversation_id": id})
		if code != 202 {
			t.Fatal(code, queued)
		}
		tick()
		form.Set("From", "whatsapp:"+number)
		return queued["id"].(string)
	}
	declinedID := queueContact("declined-contact", "+5511999999996")
	form.Set("ButtonPayload", "REJECTED")
	if response := post("permission", form, true); response.Code != 200 {
		t.Fatal(response.Code)
	}
	tick()
	if dials != 1 || a.state.Voice.Calls[declinedID].Status != "declined" {
		t.Fatal("refused permission advanced to dialing")
	}

	humanID := queueContact("human-contact", "+5511999999995")
	form.Set("ButtonPayload", "ACCEPTED")
	if response := post("permission", form, true); response.Code != 200 {
		t.Fatal(response.Code)
	}
	code, result := req(a, "POST", "/v1/sdr/conversations/human-contact/actions", alpha, "human-takeover", map[string]any{"kind": "takeover", "reason": "Atendimento manual", "expected_revision": 0})
	if code != 200 {
		t.Fatal(code, result)
	}
	tick()
	if dials != 1 || a.state.Voice.Calls[humanID].Status != "cancelled" {
		t.Fatal("human takeover allowed a pending voice dial")
	}

	permanentID := queueContact("previously-approved-contact", "+5511999999994")
	statusForm := url.Values{"AccountSid": {account}, "From": {"whatsapp:" + sender}, "To": {"whatsapp:" + phone},
		"MessageSid": {permissionID}, "MessageStatus": {"failed"}, "ErrorCode": {"37010"}}
	if response := post("permission-status/"+permanentID, statusForm, true); response.Code != 204 {
		t.Fatal(response.Code)
	}
	tick()
	if dials != 2 || !a.state.Voice.Calls[permanentID].ExistingPermission {
		t.Fatal("Twilio permanent permission was not honored")
	}
}
