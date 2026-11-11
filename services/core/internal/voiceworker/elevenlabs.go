package voiceworker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
)

// SpeechSynthesizer returns raw 8 kHz μ-law audio for the Twilio stream.
type SpeechSynthesizer interface {
	Open(context.Context, string) (io.ReadCloser, error)
}

type ElevenLabs struct {
	APIKey, VoiceID, Model string
	Client                 *http.Client
}

func (e ElevenLabs) Open(ctx context.Context, text string) (io.ReadCloser, error) {
	payload, err := json.Marshal(map[string]any{
		"text": text, "model_id": e.Model, "language_code": "pt",
		"voice_settings": map[string]float64{"stability": 0.5, "similarity_boost": 0.75, "speed": 1.05},
	})
	if err != nil {
		return nil, err
	}
	endpoint := "https://api.elevenlabs.io/v1/text-to-speech/" + url.PathEscape(e.VoiceID) + "/stream?output_format=ulaw_8000"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("xi-api-key", e.APIKey)
	resp, err := e.Client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("ElevenLabs speech HTTP %d", resp.StatusCode)
	}
	format, _, err := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if err != nil || format != "audio/ulaw" {
		resp.Body.Close()
		return nil, errors.New("ElevenLabs returned an unexpected audio format")
	}
	return resp.Body, nil
}
