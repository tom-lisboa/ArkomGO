package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"slices"
	"sort"
	"strings"
	"time"

	"sdr-next-pilot/internal/voicecall"
)

const voicePath = "v1/sdr/voice"
const voicePermissionWindow = 15 * time.Minute

type voiceProfile struct {
	Name         string `json:"name"`
	Greeting     string `json:"greeting"`
	Instructions string `json:"instructions"`
	Model        string `json:"model"`
	Voice        string `json:"voice"`
	MaxSeconds   int    `json:"max_seconds"`
}

type voiceKeys struct {
	Twilio string `json:"twilio_auth_token"`
	OpenAI string `json:"openai_api_key"`
}

type voiceConfig struct {
	ID, Account, SenderSID, Template, Sender, TestPhone string
	Revision                                            int
	Enabled                                             bool
	Keys                                                []byte
	Profile                                             voiceProfile
}

type voiceRequest struct {
	ID, Org, ConfigID                  string
	Revision, Generation               int
	Conversation, Phone, Status, Error string
	Created, Expires, Started          time.Time
	PermissionSID, ConsentSID, CallSID string
	Sequence                           int64
	StreamUsed                         bool
	ExistingPermission                 bool
}

type voiceState struct {
	Configs map[string]voiceConfig
	Calls   map[string]*voiceRequest
}

type voiceService struct {
	public      string
	key         cipher.AEAD
	http        *http.Client
	verifyModel func(context.Context, string, string) error
}

func newVoiceService(public string, key []byte) (*voiceService, error) {
	u, err := url.Parse(public)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || net.ParseIP(u.Hostname()) != nil ||
		u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/sdr-next") {
		return nil, errors.New("voice_https_domain_required")
	}
	if len(key) != 32 {
		return nil, errors.New("voice_key_required")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &voiceService{public: public, key: aead, http: &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, verifyModel: voicecall.VerifyModel}, nil
}

func (a *App) configureVoice() error {
	if a.db == nil {
		return errors.New("voice_requires_durable_storage")
	}
	raw, err := os.ReadFile(os.Getenv("SDR_VOICE_KEY_FILE"))
	if err != nil {
		return errors.New("voice_key_required")
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil {
		return errors.New("voice_key_invalid")
	}
	a.voice, err = newVoiceService(strings.TrimRight(os.Getenv("SDR_VOICE_PUBLIC_URL"), "/"), key)
	return err
}

func (v *voiceService) seal(org, id string, keys voiceKeys) ([]byte, error) {
	nonce := make([]byte, v.key.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(keys)
	if err != nil {
		return nil, err
	}
	return v.key.Seal(nonce, nonce, raw, []byte(org+"\x00"+id)), nil
}
func (v *voiceService) open(org string, c voiceConfig) (voiceKeys, error) {
	var keys voiceKeys
	size := v.key.NonceSize()
	if len(c.Keys) < size {
		return keys, errors.New("voice_credentials_unavailable")
	}
	raw, err := v.key.Open(nil, c.Keys[:size], c.Keys[size:], []byte(org+"\x00"+c.ID))
	if err != nil || json.Unmarshal(raw, &keys) != nil {
		return voiceKeys{}, errors.New("voice_credentials_unavailable")
	}
	return keys, nil
}
func (v *voiceService) url(c voiceConfig, route string) string {
	return v.public + "/" + voicePath + "/twilio/" + c.ID + "/" + route
}
func (v *voiceService) twilio(c voiceConfig, k voiceKeys) voicecall.Twilio {
	return voicecall.Twilio{Account: c.Account, Token: k.Twilio, Sender: c.Sender, SenderSID: c.SenderSID, Template: c.Template, HTTP: v.http}
}

func (a *App) voiceView(u User) map[string]any {
	c := a.state.Voice.Configs[u.Org]
	out := map[string]any{"available": a.voice != nil, "configured": c.ID != "", "enabled": c.Enabled, "can_configure": u.Role == "admin", "revision": c.Revision}
	if c.ID != "" {
		out["sender"] = c.Sender
		if u.Role == "admin" {
			out["account_sid"], out["sender_sid"], out["template_sid"], out["test_phone"], out["profile"] = c.Account, c.SenderSID, c.Template, c.TestPhone, c.Profile
			out["messaging_webhook"] = a.voice.url(c, "permission")
			out["voice_webhook"] = a.voice.url(c, "incoming")
		}
	}
	return out
}

func (a *App) voiceRoute(w http.ResponseWriter, r *http.Request, u User, path string) {
	if path == voicePath && r.Method == "GET" {
		if a.voice == nil {
			write(w, 200, map[string]bool{"available": false})
			return
		}
		write(w, 200, a.voiceView(u))
		return
	}
	if a.voice == nil {
		fail(w, 404, "not_found")
		return
	}
	if path == voicePath+"/config" && r.Method == "POST" {
		if u.Role != "admin" {
			fail(w, 403, "forbidden")
			return
		}
		a.saveVoiceConfig(w, r, u)
		return
	}
	if path == voicePath+"/disable" && r.Method == "POST" {
		if u.Role != "admin" {
			fail(w, 403, "forbidden")
			return
		}
		a.disableVoice(w, r, u)
		return
	}
	if path == voicePath+"/calls" && r.Method == "POST" {
		if u.Role == "viewer" {
			fail(w, 403, "forbidden")
			return
		}
		a.queueVoice(w, r, u)
		return
	}
	if path == voicePath+"/calls" && r.Method == "GET" {
		rows := []*voiceRequest{}
		for _, call := range a.state.Voice.Calls {
			if call.Org == u.Org {
				rows = append(rows, call)
			}
		}
		sort.Slice(rows, func(i, j int) bool { return rows[i].Created.After(rows[j].Created) })
		items := []map[string]any{}
		for _, call := range rows[:min(len(rows), 20)] {
			items = append(items, voiceCallView(call))
		}
		write(w, 200, map[string]any{"items": items})
		return
	}
	if r.Method == "GET" && strings.HasPrefix(path, voicePath+"/calls/") {
		call := a.state.Voice.Calls[strings.TrimPrefix(path, voicePath+"/calls/")]
		if call == nil || call.Org != u.Org {
			fail(w, 404, "not_found")
			return
		}
		write(w, 200, voiceCallView(call))
		return
	}
	fail(w, 404, "not_found")
}

func voiceCallView(call *voiceRequest) map[string]any {
	return map[string]any{"id": call.ID, "conversation_id": call.Conversation, "status": call.Status, "error_code": call.Error, "created_at": call.Created, "expires_at": call.Expires}
}

func (a *App) saveVoiceConfig(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		Revision  *int         `json:"expected_revision"`
		Account   string       `json:"account_sid"`
		SenderSID string       `json:"sender_sid"`
		Template  string       `json:"template_sid"`
		TestPhone string       `json:"test_phone"`
		Profile   voiceProfile `json:"profile"`
		voiceKeys
	}
	if !decodeCore(w, r, &body) {
		return
	}
	c := a.state.Voice.Configs[u.Org]
	if body.Revision == nil || c.Revision != *body.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	if !voicecall.SID(body.Account, "AC") || !voicecall.SID(body.SenderSID, "XE") || !voicecall.SID(body.Template, "HX") ||
		(body.TestPhone != "" && !voicecall.Phone(body.TestPhone)) || !validVoiceProfile(body.Profile) {
		fail(w, 422, "voice_config_invalid")
		return
	}
	for org, other := range a.state.Voice.Configs {
		if org != u.Org && other.SenderSID == body.SenderSID {
			fail(w, 409, "voice_sender_in_use")
			return
		}
	}
	for _, call := range a.state.Voice.Calls {
		if call.Org == u.Org && voiceInFlight(call.Status) && a.now().Before(call.Expires.Add(7*time.Minute)) {
			fail(w, 409, "voice_call_in_progress")
			return
		}
	}
	keys := body.voiceKeys
	if c.ID == "" {
		c.ID = token()
	} else {
		previous, err := a.voice.open(u.Org, c)
		if err != nil && (keys.Twilio == "" || keys.OpenAI == "") {
			fail(w, 503, "voice_credentials_unavailable")
			return
		}
		if keys.Twilio == "" && body.Account == c.Account {
			keys.Twilio = previous.Twilio
		}
		if keys.OpenAI == "" {
			keys.OpenAI = previous.OpenAI
		}
	}
	if !validVoiceKeys(keys) {
		fail(w, 422, "voice_credentials_required")
		return
	}
	sealed, err := a.voice.seal(u.Org, c.ID, keys)
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	c.Account, c.SenderSID, c.Template, c.TestPhone, c.Profile, c.Keys = body.Account, body.SenderSID, body.Template, body.TestPhone, body.Profile, sealed
	c.Revision++
	c.Enabled, c.Sender = false, ""
	if err = a.transact(func() {
		a.state.Voice.Configs[u.Org] = c
		a.cancelPendingVoice(u.Org)
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "voice.config.saved", Revision: c.Revision})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, a.voiceView(u))
}

func validVoiceProfile(p voiceProfile) bool {
	return textOK(p.Name, 80, true) && textOK(p.Greeting, 400, true) && textOK(p.Instructions, 4000, true) &&
		slices.Contains([]string{"gpt-realtime", "gpt-realtime-mini"}, p.Model) &&
		slices.Contains([]string{"marin", "cedar", "alloy", "coral", "sage", "verse"}, p.Voice) &&
		p.MaxSeconds >= 30 && p.MaxSeconds <= 300
}
func validVoiceKeys(k voiceKeys) bool {
	if len(k.Twilio) != 32 || !voicecall.SID("AC"+k.Twilio, "AC") {
		return false
	}
	return strings.HasPrefix(k.OpenAI, "sk-") && len(k.OpenAI) >= 20 && len(k.OpenAI) <= 512 && !strings.ContainsAny(k.OpenAI, " \t\r\n\x00")
}

func (a *App) disableVoice(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		Revision *int `json:"expected_revision"`
	}
	if !decodeCore(w, r, &body) {
		return
	}
	c := a.state.Voice.Configs[u.Org]
	if c.ID == "" || body.Revision == nil || c.Revision != *body.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	if err := a.transact(func() {
		c.Enabled = false
		c.Revision++
		a.state.Voice.Configs[u.Org] = c
		a.cancelPendingVoice(u.Org)
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "voice.disabled", Revision: c.Revision})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, a.voiceView(u))
}

func (a *App) cancelPendingVoice(org string) {
	for _, call := range a.state.Voice.Calls {
		if call.Org == org && !voiceTerminal(call.Status) && !voiceInFlight(call.Status) {
			call.Status = "cancelled"
			call.Error = "voice_configuration_changed"
		}
	}
}

func (a *App) activateVoiceHTTP(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	if !pilotCORS(w, r) {
		a.mu.Unlock()
		return
	}
	if r.Method != "POST" || a.voice == nil {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	key := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	session, ok := a.sessions[fmt.Sprintf("%x", sha256.Sum256([]byte(key)))]
	if key == "" || !ok || !session.Expires.After(a.now()) {
		a.mu.Unlock()
		fail(w, 401, "unauthorized")
		return
	}
	u, err := a.directoryUser(r.Context(), session.User)
	if err != nil {
		a.mu.Unlock()
		directoryFailure(w, err)
		return
	}
	if u.Role != "admin" {
		a.mu.Unlock()
		fail(w, 403, "forbidden")
		return
	}
	if !a.allow(w, r, []quota{{"voice-verify:" + u.Org, 6, 15 * time.Minute}}) {
		a.mu.Unlock()
		return
	}
	var body struct {
		Revision *int `json:"expected_revision"`
	}
	if !decodeCore(w, r, &body) {
		a.mu.Unlock()
		return
	}
	c := a.state.Voice.Configs[u.Org]
	if c.ID == "" || body.Revision == nil || c.Revision != *body.Revision {
		a.mu.Unlock()
		fail(w, 409, "revision_conflict")
		return
	}
	if c.Enabled {
		view := a.voiceView(u)
		a.mu.Unlock()
		write(w, 200, view)
		return
	}
	keys, err := a.voice.open(u.Org, c)
	a.mu.Unlock()
	if err != nil {
		fail(w, 503, "voice_credentials_unavailable")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	sender, err := a.voice.twilio(c, keys).Verify(ctx, a.voice.url(c, "permission"))
	if err != nil {
		fail(w, 422, err.Error())
		return
	}
	if sender == c.TestPhone {
		fail(w, 422, "voice_test_phone_must_differ")
		return
	}
	if err = a.voice.verifyModel(ctx, keys.OpenAI, c.Profile.Model); err != nil {
		fail(w, 422, "voice_openai_model_unavailable")
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if current := a.state.Voice.Configs[u.Org]; current.ID != c.ID || current.Revision != c.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	if err = a.transact(func() {
		c.Enabled, c.Sender = true, sender
		c.Revision++
		a.state.Voice.Configs[u.Org] = c
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "voice.enabled", Revision: c.Revision})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 200, a.voiceView(u))
}
