package voicecall

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type fakeAudio struct {
	toModel, fromModel chan json.RawMessage
}

func (a fakeAudio) SendRaw(ctx context.Context, raw json.RawMessage) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case a.toModel <- raw:
		return nil
	}
}
func (a fakeAudio) RecvRaw(ctx context.Context) (json.RawMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case raw := <-a.fromModel:
		return raw, nil
	}
}
func (a fakeAudio) Close() error { return nil }

func TestBidirectionalAudioUsesSelectedProfile(t *testing.T) {
	a := fakeAudio{make(chan json.RawMessage, 4), make(chan json.RawMessage, 4)}
	account, call, stream := "AC"+strings.Repeat("a", 32), "CA"+strings.Repeat("b", 32), "MZ"+strings.Repeat("c", 32)
	session := Session{Account: account, CallSID: call, Name: "Assistente Alfa", Greeting: "Olá, sou a voz da Alfa", Instructions: "Converse sobre a oficina.", Voice: "cedar", Model: "gpt-realtime-mini", MaxDuration: 5 * time.Second, Start: func() bool { return true }, Allowed: func() bool { return true }}
	finished := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		finished <- run(w, r, session, func(context.Context) (audioConnection, error) { return a, nil })
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tw, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tw.CloseNow()
	send := func(v any) {
		t.Helper()
		if err := wsjson.Write(ctx, tw, v); err != nil {
			t.Fatal(err)
		}
	}
	nextAI := func() string {
		t.Helper()
		select {
		case raw := <-a.toModel:
			return string(raw)
		case <-ctx.Done():
			t.Fatal("no Realtime message")
			return ""
		}
	}
	send(map[string]string{"event": "connected"})
	send(map[string]any{"event": "start", "start": map[string]any{"accountSid": account, "callSid": call, "streamSid": stream, "mediaFormat": map[string]any{"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}}})
	if config := nextAI(); !strings.Contains(config, `"voice":"cedar"`) || !strings.Contains(config, `"type":"audio/pcmu"`) || !strings.Contains(config, "Converse sobre a oficina.") {
		t.Fatal("tenant voice settings did not reach the session", config)
	}
	a.fromModel <- json.RawMessage(`{"type":"session.updated"}`)
	if first := nextAI(); !strings.Contains(first, "Olá, sou a voz da Alfa") {
		t.Fatal("opening missing", first)
	}
	send(map[string]any{"event": "media", "streamSid": stream, "media": map[string]string{"track": "inbound", "payload": "/w=="}})
	if input := nextAI(); !strings.Contains(input, `"audio":"/w=="`) {
		t.Fatal("phone audio did not reach Realtime", input)
	}
	a.fromModel <- json.RawMessage(`{"type":"response.output_audio.delta","item_id":"item_1","delta":"/w=="}`)
	var audio struct {
		Event     string
		StreamSID string `json:"streamSid"`
		Media     struct{ Payload string }
	}
	if err := wsjson.Read(ctx, tw, &audio); err != nil || audio.Event != "media" || audio.StreamSID != stream || audio.Media.Payload != "/w==" {
		t.Fatal("AI audio did not reach Twilio", audio, err)
	}
	send(map[string]string{"event": "stop", "streamSid": stream})
	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("voice stream did not finish")
	}
}
