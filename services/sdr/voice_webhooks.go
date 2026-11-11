package main

import (
	"context"
	"crypto/hmac"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sdr-next-pilot/internal/voicecall"
)

func (a *App) voiceWebhook(w http.ResponseWriter, r *http.Request) {
	if a.voice == nil || r.URL.RawQuery != "" {
		http.NotFound(w, r)
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"+voicePath+"/twilio/"), "/")
	if len(parts) < 2 || len(parts) > 3 || len(parts[0]) != 48 {
		http.NotFound(w, r)
		return
	}
	a.mu.Lock()
	var config voiceConfig
	var org string
	for candidate, current := range a.state.Voice.Configs {
		if current.ID == parts[0] {
			org, config = candidate, current
			break
		}
	}
	keys, err := a.voice.open(org, config)
	a.mu.Unlock()
	if org == "" || err != nil {
		http.Error(w, "invalid callback", 403)
		return
	}
	absolute := a.voice.public + r.URL.EscapedPath()
	sig := []byte(r.Header.Get("X-Twilio-Signature"))
	if parts[1] == "stream" && r.Method == "GET" && len(parts) == 3 {
		wss := strings.Replace(absolute, "https://", "wss://", 1)
		if !hmac.Equal(sig, []byte(voicecall.Signature(keys.Twilio, absolute, nil))) &&
			!hmac.Equal(sig, []byte(voicecall.Signature(keys.Twilio, wss, nil))) {
			http.Error(w, "invalid signature", 403)
			return
		}
		a.streamVoice(w, r, org, parts[2])
		return
	}
	if r.Method != "POST" {
		http.NotFound(w, r)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if r.ParseForm() != nil || r.PostForm.Get("AccountSid") != config.Account ||
		!hmac.Equal(sig, []byte(voicecall.Signature(keys.Twilio, absolute, r.PostForm))) {
		http.Error(w, "invalid signature", 403)
		return
	}
	switch {
	case len(parts) == 2 && parts[1] == "permission":
		a.voicePermission(w, r, org, config, keys)
	case len(parts) == 2 && parts[1] == "incoming":
		voiceXML(w, "<Response><Reject/></Response>")
	case len(parts) == 3 && (parts[1] == "answer" || parts[1] == "status" || parts[1] == "permission-status"):
		a.voiceCallCallback(w, r, org, config, parts[1], parts[2])
	default:
		http.NotFound(w, r)
	}
}

func voiceXML(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	_, _ = fmt.Fprint(w, body)
}

func (a *App) voicePermission(w http.ResponseWriter, r *http.Request, org string, c voiceConfig, keys voiceKeys) {
	form := r.PostForm
	decision := form.Get("ButtonPayload")
	sid := form.Get("MessageSid")
	from := strings.TrimPrefix(form.Get("From"), "whatsapp:")
	replySID := form.Get("OriginalRepliedMessageSid")
	if !c.Enabled || form.Get("Body") != "VOICE_CALL_REQUEST" || form.Get("To") != "whatsapp:"+c.Sender ||
		form.Get("From") != "whatsapp:"+from || !voicecall.Phone(from) || (decision != "ACCEPTED" && decision != "REJECTED") ||
		(!voicecall.SID(sid, "SM") && !voicecall.SID(sid, "MM")) {
		voiceXML(w, "<Response/>")
		return
	}

	a.mu.Lock()
	callID := ""
	for _, call := range a.state.Voice.Calls {
		if call.Org == org && call.Phone == from && (call.Status == "requesting" || call.Status == "awaiting_permission") &&
			a.voiceAllowed(call, c) && a.now().Before(call.Expires) &&
			(replySID == "" || call.PermissionSID == "" || replySID == call.PermissionSID) {
			callID = call.ID
			break
		}
	}
	a.mu.Unlock()
	if callID == "" {
		voiceXML(w, "<Response/>")
		return
	}
	at, err := a.voice.twilio(c, keys).PermissionTime(r.Context(), sid, from)
	if err != nil {
		http.Error(w, "provider verification pending", 503)
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	call := a.state.Voice.Calls[callID]
	now := a.now()
	if call == nil || (call.Status != "requesting" && call.Status != "awaiting_permission") ||
		!a.voiceAllowed(call, a.state.Voice.Configs[org]) || !now.Before(call.Expires) ||
		at.Before(call.Started.Truncate(time.Second)) || at.After(now.Add(time.Minute)) ||
		(replySID != "" && call.PermissionSID != "" && replySID != call.PermissionSID) {
		voiceXML(w, "<Response/>")
		return
	}
	if err = a.transact(func() {
		call.ConsentSID = sid
		if decision == "ACCEPTED" {
			call.Status = "approved"
		} else {
			call.Status = "declined"
		}
		a.record(AuditEntry{Org: org, Actor: "twilio", Action: "voice.permission." + strings.ToLower(decision), Conversation: call.Conversation, Operation: call.ID})
	}); err != nil {
		http.Error(w, "storage unavailable", 503)
		return
	}
	voiceXML(w, "<Response/>")
}

func (a *App) voiceCallCallback(w http.ResponseWriter, r *http.Request, org string, c voiceConfig, kind, id string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	call := a.state.Voice.Calls[id]
	if call == nil || call.Org != org || call.ConfigID != c.ID {
		http.NotFound(w, r)
		return
	}
	form := r.PostForm
	if kind == "permission-status" {
		status := form.Get("MessageStatus")
		sid := form.Get("MessageSid")
		if (status == "failed" || status == "undelivered") &&
			(call.Status == "awaiting_permission" || call.Status == "requesting") &&
			(voicecall.SID(sid, "SM") || voicecall.SID(sid, "MM")) &&
			(call.PermissionSID == "" || call.PermissionSID == sid) &&
			form.Get("From") == "whatsapp:"+c.Sender && form.Get("To") == "whatsapp:"+call.Phone {
			if err := a.transact(func() {
				call.Status, call.Error, call.PermissionSID = "failed", "voice_permission_delivery_failed", sid
				if form.Get("ErrorCode") == "37010" && a.now().Before(call.Expires) && a.voiceAllowed(call, a.state.Voice.Configs[org]) {
					// The signed receipt confirms WhatsApp already has a permanent grant.
					call.Status, call.Error, call.ExistingPermission = "approved", "", true
				}
			}); err != nil {
				http.Error(w, "storage unavailable", 503)
				return
			}
		}
		w.WriteHeader(204)
		return
	}
	sid := form.Get("CallSid")
	if !voicecall.SID(sid, "CA") || (call.CallSID != "" && call.CallSID != sid) ||
		form.Get("From") != "whatsapp:"+c.Sender || form.Get("To") != "whatsapp:"+call.Phone {
		http.Error(w, "invalid call", 403)
		return
	}
	if kind == "answer" {
		if !voiceInFlight(call.Status) || (call.ConsentSID == "" && !call.ExistingPermission) || !a.voiceAllowed(call, a.state.Voice.Configs[org]) ||
			a.now().After(call.Expires.Add(time.Minute)) || call.StreamUsed {
			voiceXML(w, "<Response><Hangup/></Response>")
			return
		}
		if call.CallSID == "" {
			if err := a.transact(func() { call.CallSID = sid }); err != nil {
				http.Error(w, "storage unavailable", 503)
				return
			}
		}
		stream := strings.Replace(a.voice.url(c, "stream/"+id), "https://", "wss://", 1)
		var escaped strings.Builder
		_ = xml.EscapeText(&escaped, []byte(stream))
		voiceXML(w, `<Response><Connect><Stream url="`+escaped.String()+`"/></Connect><Hangup/></Response>`)
		return
	}
	sequence, err := strconv.ParseInt(form.Get("SequenceNumber"), 10, 64)
	status := form.Get("CallStatus")
	switch status {
	case "initiated", "queued", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled":
	default:
		w.WriteHeader(204)
		return
	}
	if err != nil || sequence <= call.Sequence || !voiceInFlight(call.Status) {
		w.WriteHeader(204)
		return
	}
	if err = a.transact(func() {
		call.CallSID, call.Sequence = sid, sequence
		if !call.StreamUsed || voiceTerminal(status) {
			call.Status = status
		}
	}); err != nil {
		http.Error(w, "storage unavailable", 503)
		return
	}
	w.WriteHeader(204)
}

func (a *App) streamVoice(w http.ResponseWriter, r *http.Request, org, id string) {
	a.mu.Lock()
	call := a.state.Voice.Calls[id]
	if call == nil || call.Org != org || !voiceInFlight(call.Status) || call.CallSID == "" ||
		call.StreamUsed || !a.voiceAllowed(call, a.state.Voice.Configs[org]) {
		a.mu.Unlock()
		http.Error(w, "voice unavailable", 409)
		return
	}
	config := a.state.Voice.Configs[org]
	keys, err := a.voice.open(org, config)
	snapshot := *call
	contextText := a.voiceContext(call)
	a.mu.Unlock()
	if err != nil {
		http.Error(w, "voice unavailable", 503)
		return
	}

	session := voicecall.Session{
		Account: config.Account, CallSID: snapshot.CallSID, APIKey: keys.OpenAI,
		Model: config.Profile.Model, Voice: config.Profile.Voice, Name: config.Profile.Name,
		Greeting: config.Profile.Greeting, Instructions: config.Profile.Instructions, Context: contextText,
		MaxDuration: time.Duration(config.Profile.MaxSeconds) * time.Second,
	}
	started := false
	session.Start = func() bool {
		a.mu.Lock()
		defer a.mu.Unlock()
		call := a.state.Voice.Calls[id]
		if call == nil || call.StreamUsed || call.CallSID != snapshot.CallSID || !voiceInFlight(call.Status) ||
			!a.voiceAllowed(call, a.state.Voice.Configs[org]) {
			return false
		}
		started = a.transact(func() { call.StreamUsed, call.Status = true, "in-progress" }) == nil
		return started
	}
	session.Allowed = func() bool {
		a.mu.Lock()
		defer a.mu.Unlock()
		call := a.state.Voice.Calls[id]
		return call != nil && call.Status == "in-progress" && a.voiceAllowed(call, a.state.Voice.Configs[org])
	}
	if err = voicecall.Run(w, r, session); err != nil && started {
		// No credentials, prompt, media, or raw provider error in logs or records.
		a.mu.Lock()
		call := a.state.Voice.Calls[id]
		if call != nil && call.StreamUsed && call.Status == "in-progress" {
			_ = a.transact(func() { call.Error = "voice_stream_interrupted" })
		}
		a.mu.Unlock()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = a.voice.twilio(config, keys).Hangup(ctx, snapshot.CallSID)
	}
}

func (a *App) voiceContext(call *voiceRequest) string {
	if call.Conversation == "" {
		return ""
	}
	messages := a.state.Messages[call.Conversation]
	var context strings.Builder
	for _, m := range messages[max(0, len(messages)-6):] {
		if m.Status != "sent" && m.Status != "received" {
			continue
		}
		runes := []rune(m.Text)
		context.WriteString(m.Author)
		context.WriteString(": ")
		context.WriteString(string(runes[:min(len(runes), 400)]))
		context.WriteByte('\n')
	}
	return context.String()
}
