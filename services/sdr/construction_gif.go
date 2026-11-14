package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"deeph/pkg/construction"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Shared with the existing CLIPS UI bridge. Ownership always comes from the
// authenticated organization AND user, never from the agent's tool arguments.
func setClipsGIFIdentity(request *http.Request, u User, secret string) {
	mac := hmac.New(sha256.New, []byte(secret))
	subjectInput, _ := json.Marshal([]string{"clips-gif-subject/v1", u.Org, u.ID})
	mac.Write(subjectInput)
	raw := hex.EncodeToString(mac.Sum(nil)[:16])
	subject := raw[:8] + "-" + raw[8:12] + "-" + raw[12:16] + "-" + raw[16:20] + "-" + raw[20:]
	scope := "write"
	if u.Role == "viewer" {
		scope = "read"
	} else if u.Role == "admin" && u.Environment == "isolated-test" && (u.Org == "org_demo_alfa" && u.ID == "user_alfa_admin" || u.Org == betaOrganization && homologCRMEnabled(u.Org) && u.ID == "user_beta_admin") {
		scope = "demo"
	}
	mac.Reset()
	mac.Write([]byte("clips-gif/v1\x00" + subject + "\x00" + scope + "\x00" + request.Method + "\x00" + request.URL.Path))
	request.Header.Set("X-Arkom-Clips-Subject", subject)
	request.Header.Set("X-Arkom-Clips-Scope", scope)
	request.Header.Set("X-Arkom-Clips-Signature", hex.EncodeToString(mac.Sum(nil)))
}

type constructionGIFGenerator struct {
	app     *App
	user    User
	buildID string
}

func (g constructionGIFGenerator) request(ctx context.Context, method, path string, body any) ([]byte, error) {
	if g.user.ID == "" || g.user.Org == "" || g.user.Role == "viewer" {
		return nil, errors.New("gif_account_unavailable")
	}
	user, err := g.app.directoryUser(ctx, g.user)
	if err != nil || user.Role == "viewer" {
		return nil, errors.New("gif_account_unavailable")
	}
	address := localLoopbackAddress("ARKOM_LOCAL_CLIPS_LISTEN", "127.0.0.1:18082")
	secret := os.Getenv("SDR_CLIPS_BRIDGE_KEY")
	if address == "invalid-local-listen-address" || len(secret) < 32 {
		return nil, errors.New("clips_unavailable")
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, method, "http://"+address+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	// One worker request per construction, also across retries/restarts. A changed
	// prompt conflicts with the original request instead of buying another GIF.
	digest := sha256.Sum256([]byte("genesis-gif/v1:" + g.buildID))
	request.Header.Set("Idempotency-Key", hex.EncodeToString(digest[:]))
	setClipsGIFIdentity(request, user, secret)
	response, err := ecosystemClient.Do(request)
	if err != nil {
		return nil, errors.New("clips_unavailable")
	}
	defer response.Body.Close()
	limit := int64(2 << 20)
	if path == "/app/gifs" {
		limit = 256 << 10
	}
	data, err = io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, errors.New("gif_response_limit")
	}
	if response.StatusCode != 200 && response.StatusCode != 202 {
		var failure struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &failure)
		switch failure.Error {
		case "gif_credential_unavailable", "gif_already_pending", "gif_capacity", "gif_request_conflict":
			return nil, errors.New(failure.Error)
		}
		return nil, fmt.Errorf("clips_http_%d", response.StatusCode)
	}
	return data, nil
}
func (g constructionGIFGenerator) GenerateGIF(ctx context.Context, _ string, input construction.GIFRequest) (construction.GIFOutput, error) {
	ctx, cancel := context.WithTimeout(ctx, 6*time.Minute)
	defer cancel()
	data, err := g.request(ctx, http.MethodGet, "/app/gifs", nil)
	if err != nil {
		return construction.GIFOutput{}, err
	}
	var status struct {
		HasKey bool `json:"has_key"`
	}
	if json.Unmarshal(data, &status) != nil {
		return construction.GIFOutput{}, errors.New("gif_response_invalid")
	}
	data, err = g.request(ctx, http.MethodPost, "/app/gifs", map[string]any{"prompt": input.Prompt, "gift": !status.HasKey})
	if err != nil {
		return construction.GIFOutput{}, err
	}
	var job struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(data, &job) != nil || !clipsJobID.MatchString(job.ID) {
		return construction.GIFOutput{}, errors.New("gif_response_invalid")
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		data, err = g.request(ctx, http.MethodGet, "/app/gifs", nil)
		if err != nil {
			return construction.GIFOutput{}, err
		}
		var jobs struct {
			Jobs []struct{ ID, Status string } `json:"jobs"`
		}
		if json.Unmarshal(data, &jobs) != nil {
			return construction.GIFOutput{}, errors.New("gif_response_invalid")
		}
		for _, current := range jobs.Jobs {
			if current.ID != job.ID {
				continue
			}
			switch current.Status {
			case "done":
				data, err = g.request(ctx, http.MethodGet, "/app/gifs/"+job.ID+"/image", nil)
				return construction.GIFOutput{JobID: job.ID, Data: data}, err
			case "failed":
				return construction.GIFOutput{}, errors.New("clips_gif_failed")
			}
		}
		select {
		case <-ctx.Done():
			return construction.GIFOutput{}, ctx.Err()
		case <-ticker.C:
		}
	}
}
