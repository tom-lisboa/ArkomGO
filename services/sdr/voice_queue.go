package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"sdr-next-pilot/internal/voicecall"
)

func voiceTerminal(status string) bool {
	switch status {
	case "completed", "cancelled", "declined", "expired", "failed", "busy", "no-answer", "canceled":
		return true
	default:
		return false
	}
}

func voiceInFlight(status string) bool {
	switch status {
	case "dialing", "queued", "initiated", "ringing", "in-progress", "uncertain_call":
		return true
	default:
		return false
	}
}

func (a *App) queueVoice(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		Conversation string `json:"conversation_id"`
		Test         bool   `json:"test"`
	}
	if !decodeCore(w, r, &body) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if (body.Conversation != "") == body.Test || key == "" || len(key) > 100 {
		fail(w, 422, "voice_call_request_invalid")
		return
	}
	if body.Test && u.Role != "admin" {
		fail(w, 403, "forbidden")
		return
	}
	fingerprint := fingerprint(body)
	replayKey := "voice-call:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, replayKey, fingerprint) {
		return
	}
	config := a.state.Voice.Configs[u.Org]
	if !config.Enabled {
		fail(w, 409, "voice_not_enabled")
		return
	}
	now := a.now().UTC()
	call := &voiceRequest{ID: token(), Org: u.Org, ConfigID: config.ID, Revision: config.Revision, Conversation: body.Conversation, Status: "queued_permission", Created: now, Expires: now.Add(voicePermissionWindow), Sequence: -1}
	if body.Test {
		call.Phone = config.TestPhone
	} else {
		conv := a.state.Conversations[body.Conversation]
		if conv == nil || conv.Org != u.Org || conv.Channel != "whatsapp" {
			fail(w, 404, "not_found")
			return
		}
		call.Phone = "+" + strings.TrimSuffix(a.state.Transport.Bindings[conv.ID].Target, "@s.whatsapp.net")
		call.Generation = a.state.Generation[conv.ID]
	}
	if !voicecall.Phone(call.Phone) || !a.voiceAllowed(call, config) {
		fail(w, 409, "voice_contact_unavailable")
		return
	}
	daily := 0
	for _, old := range a.state.Voice.Calls {
		if old.Org != u.Org {
			continue
		}
		if now.Sub(old.Created) < 24*time.Hour {
			daily++
			if old.Phone == call.Phone {
				fail(w, 409, "voice_contact_daily_limit")
				return
			}
		}
	}
	if daily >= 20 {
		fail(w, 409, "voice_daily_limit")
		return
	}
	out := voiceCallView(call)
	if err := a.transact(func() {
		for id, old := range a.state.Voice.Calls {
			if now.Sub(old.Created) >= 30*24*time.Hour {
				delete(a.state.Voice.Calls, id)
			}
		}
		a.state.Voice.Calls[call.ID] = call
		raw, _ := json.Marshal(out)
		a.state.Results[replayKey] = result{fingerprint, raw, 202}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "voice.permission.queued", Conversation: call.Conversation, Operation: call.ID})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 202, out)
}

func (a *App) voiceAllowed(call *voiceRequest, config voiceConfig) bool {
	if !config.Enabled || config.ID != call.ConfigID || config.Revision != call.Revision || config.Sender == call.Phone {
		return false
	}
	if call.Conversation == "" {
		return config.TestPhone == call.Phone
	}
	c := a.state.Conversations[call.Conversation]
	b := a.state.Transport.Bindings[call.Conversation]
	p := a.state.Transport.Policies[call.Org]
	return c != nil && c.Org == call.Org && c.Channel == "whatsapp" && c.Automation == "active" && !c.OptedOut &&
		b.Org == call.Org && "+"+strings.TrimSuffix(b.Target, "@s.whatsapp.net") == call.Phone &&
		allowsReal(p, b.Epoch, b.Target) && a.state.Generation[c.ID] == call.Generation
}

func (a *App) runVoiceWorker(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := a.voiceTick(ctx); err != nil {
				log.Print("voice queue storage temporarily unavailable")
			}
		}
	}
}

// Reserve the attempt in SQLite before touching Twilio. An ambiguous request
// is never retried automatically because it may have succeeded at the carrier.
func (a *App) claimVoice() (voiceRequest, voiceConfig, voiceKeys, bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now().UTC()
	var chosen *voiceRequest
	cleanup := map[string]string{}
	for _, call := range a.state.Voice.Calls {
		if voiceTerminal(call.Status) {
			continue
		}
		if call.Status == "requesting" || call.Status == "dialing" {
			if now.Sub(call.Started) > 35*time.Second {
				if call.Status == "dialing" {
					cleanup[call.ID] = "uncertain_call"
				} else {
					cleanup[call.ID] = "failed"
				}
			}
			continue
		}
		if voiceInFlight(call.Status) {
			if now.After(call.Expires.Add(7 * time.Minute)) {
				cleanup[call.ID] = "expired"
			}
			continue
		}
		if !now.Before(call.Expires) {
			cleanup[call.ID] = "expired"
			continue
		}
		if !a.voiceAllowed(call, a.state.Voice.Configs[call.Org]) {
			cleanup[call.ID] = "cancelled"
			continue
		}
		if (call.Status == "queued_permission" || call.Status == "approved") && (chosen == nil || call.Created.Before(chosen.Created)) {
			chosen = call
		}
	}
	var snapshot voiceRequest
	var config voiceConfig
	var keys voiceKeys
	if len(cleanup) == 0 && chosen == nil {
		return snapshot, config, keys, false, nil
	}
	if chosen != nil {
		config = a.state.Voice.Configs[chosen.Org]
		var err error
		keys, err = a.voice.open(chosen.Org, config)
		if err != nil {
			cleanup[chosen.ID] = "failed"
			chosen = nil
		}
	}
	err := a.transact(func() {
		for id, status := range cleanup {
			c := a.state.Voice.Calls[id]
			c.Status = status
			c.Error = "voice_attempt_closed"
		}
		if chosen != nil {
			chosen.Started = now
			if chosen.Status == "approved" {
				chosen.Status = "dialing"
			} else {
				chosen.Status = "requesting"
			}
			snapshot = *chosen
		}
	})
	return snapshot, config, keys, chosen != nil && err == nil, err
}

func (a *App) voiceTick(ctx context.Context) error {
	call, config, keys, claimed, err := a.claimVoice()
	if err != nil || !claimed {
		return err
	}
	t := a.voice.twilio(config, keys)
	a.mu.Lock()
	allowed := a.voiceAllowed(&call, a.state.Voice.Configs[call.Org])
	a.mu.Unlock()
	status, code, sid := "cancelled", "", ""
	existingPermission := false
	if allowed {
		ctx, cancel := context.WithTimeout(ctx, 7*time.Second)
		defer cancel()
		if call.Status == "dialing" {
			sid, err = t.Dial(ctx, call.Phone, a.voice.url(config, "answer/"+call.ID), a.voice.url(config, "status/"+call.ID), config.Profile.MaxSeconds)
			status = "queued"
		} else {
			sid, err = t.RequestPermission(ctx, call.Phone, a.voice.url(config, "permission-status/"+call.ID))
			status = "awaiting_permission"
		}
		if err != nil {
			status, code = "failed", "twilio_unavailable"
			var failure *voicecall.Failure
			if errors.As(err, &failure) {
				code = failure.Code
				if call.Status == "requesting" && failure.Code == "twilio_37010" && !failure.Uncertain {
					status, code, existingPermission = "approved", "", true
				} else if failure.Uncertain && call.Status == "dialing" {
					status = "uncertain_call"
				}
			}
		}
	}
	a.mu.Lock()
	current := a.state.Voice.Calls[call.ID]
	if current == nil {
		a.mu.Unlock()
		return nil
	}
	err = a.transact(func() {
		if call.Status == "dialing" && sid != "" && current.CallSID == "" {
			current.CallSID = sid
		}
		if call.Status == "requesting" && sid != "" && current.PermissionSID == "" {
			current.PermissionSID = sid
		}
		if current.Status == call.Status {
			current.Status, current.Error = status, code
			if existingPermission {
				current.ExistingPermission = true
			}
		}
	})
	needsStop := call.Status == "dialing" && sid != "" && !a.voiceAllowed(&call, a.state.Voice.Configs[call.Org])
	a.mu.Unlock()
	if needsStop {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = t.Hangup(ctx, sid)
	}
	return err
}
