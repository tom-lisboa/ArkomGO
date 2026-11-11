package main

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"sdr-next-pilot/pkg/sdrsdk"
	"testing"
	"time"
)

func libraryFixture(a *App, tok, key string, data []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	f, _ := mw.CreateFormFile("file", "video.mp4")
	_, _ = f.Write(data)
	_ = mw.Close()
	r := httptest.NewRequest("POST", "/v1/sdr/media", &body)
	r.Header.Set("Authorization", "Bearer "+tok)
	r.Header.Set("Idempotency-Key", key)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}

func preparedLibraryVideo(t *testing.T, a *App, tok string, q *sdrsdk.Client) string {
	t.Helper()
	// The media worker codec suite separately verifies actual MP4 decoding.
	data := append([]byte{0, 0, 0, 24}, []byte("ftypisom\x00\x00\x02\x00isomiso2")...)
	w := libraryFixture(a, tok, token(), data)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	var out struct{ Asset MediaAsset }
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if out.Asset.Conversation != "" || out.Asset.File.Kind != "video" {
		t.Fatal("library upload bound to conversation", out)
	}
	j, ok, err := q.ClaimMedia(context.Background())
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	mediaCompleteFixture(t, q, j, "")
	return out.Asset.ID
}

func mediaFlow(approval string) PlatformConfig {
	return PlatformConfig{Tools: []ToolConfig{{ID: "enviar_arquivo", Name: "Enviar arquivo", Handler: "media.send", Enabled: true, Approval: approval, ApproverRoles: []string{"admin"}}}, Workflows: []WorkflowConfig{{ID: "video_cliente", Name: "Vídeo definido pelo cliente", Description: "Criado sem tela fixa", Solution: "sdr", Enabled: true, Roles: []string{"admin", "operator"},
		Inputs: []InputField{{"conversation_id", "Conversa", true, "", 100}, {"media_id", "Arquivo", true, "", 100}, {"caption", "Legenda", false, "", 1000}},
		Steps:  []FlowStep{{ID: "envio", ToolID: "enviar_arquivo", Inputs: map[string]ValueBinding{"conversation_id": {From: "input", Key: "conversation_id"}, "media_id": {From: "input", Key: "media_id"}, "caption": {From: "input", Key: "caption"}}}}, Automation: AutoTrigger{Conditions: []MemoryCondition{}, Inputs: map[string]ValueBinding{}}}}}
}

func TestClientMediaFlowVideoQueueReplayDeliveryAndReuse(t *testing.T) {
	a, creds, _, eq, _ := pipelineApp(t)
	admin := login(t, a, creds, "alfa.admin")
	beta := login(t, a, creds, "beta.admin")
	viewer := login(t, a, creds, "alfa.viewer")
	mq := enableMediaTest(t, a)
	mediaID := preparedLibraryVideo(t, a, admin, mq)
	if w := libraryFixture(a, viewer, token(), fixturePNG()); w.Code != 403 {
		t.Fatal("viewer uploaded", w.Code)
	}
	publishPlatform(t, a, admin, mediaFlow("automatic"))
	body := map[string]any{"workflow_id": "video_cliente", "mode": "apply", "source": "published", "input": map[string]string{"conversation_id": "conv_demo_alfa", "media_id": mediaID, "caption": "Apresentação escolhida pelo cliente"}}
	key := token()
	code, out := req(a, "POST", "/v1/platform/executions", admin, key, body)
	if code != 202 {
		t.Fatal(code, out)
	}
	id := out["execution"].(map[string]any)["id"].(string)
	code, _ = req(a, "POST", "/v1/platform/executions", admin, key, body)
	if code != 202 || len(a.state.Platform.Executions) != 1 {
		t.Fatal("duplicated execution")
	}
	j, ok, err := eq.ClaimOperation(context.Background())
	if !ok || err != nil || j.Plan.Handler != "media.send" {
		t.Fatal(ok, err)
	}
	result, err := sdrsdk.ComputeAction(j.Plan)
	if err != nil {
		t.Fatal(err)
	}
	a.failSave = true
	if err = eq.CompleteOperation(context.Background(), j, result); err == nil {
		t.Fatal("commit failure ignored")
	}
	a.failSave = false
	if len(a.state.Messages["conv_demo_alfa"]) != 0 {
		t.Fatal("failed commit queued a message")
	}
	if err = eq.CompleteOperation(context.Background(), j, result); err != nil {
		t.Fatal(err)
	}
	if err = eq.CompleteOperation(context.Background(), j, result); err != nil {
		t.Fatal(err)
	}
	m := a.state.Messages["conv_demo_alfa"][0]
	if len(a.state.Messages["conv_demo_alfa"]) != 1 || m.Status != "queued" || m.Media.Kind != "video" || m.ExecutionID != id {
		t.Fatal("not queued exactly once", m)
	}
	path := "/v1/sdr/conversations/conv_demo_alfa/messages/" + m.ID
	if code, _ = req(a, "GET", path, beta, "", nil); code != 404 {
		t.Fatal("cross tenant message", code)
	}
	if err = a.Drain(); err != nil {
		t.Fatal(err)
	}
	if code, out = req(a, "GET", path, admin, "", nil); code != 200 || out["status"] != "sent" {
		t.Fatal(code, out)
	}
	// A second execution can reuse the same company asset in another conversation.
	a.state.Conversations["alfa_segunda"] = &Conversation{ID: "alfa_segunda", Org: "org_demo_alfa", Channel: "fake_whatsapp", Automation: "active"}
	id = createOp(t, a, admin, "video_cliente", "apply", map[string]string{"conversation_id": "alfa_segunda", "media_id": mediaID})
	driveOps(t, a, eq, id)
	if len(a.state.Messages["alfa_segunda"]) != 1 {
		t.Fatal("reusable asset was restricted to first conversation")
	}
}

func TestClientMediaApprovalPreviewAndTenantFences(t *testing.T) {
	for _, mode := range []string{"preview", "approval", "cross_asset", "pause_during_worker"} {
		t.Run(mode, func(t *testing.T) {
			a, creds, _, eq, _ := pipelineApp(t)
			admin := login(t, a, creds, "alfa.admin")
			mq := enableMediaTest(t, a)
			mediaID := preparedLibraryVideo(t, a, admin, mq)
			approval := "automatic"
			if mode == "approval" {
				approval = "always"
			}
			publishPlatform(t, a, admin, mediaFlow(approval))
			executionMode := "apply"
			if mode == "preview" {
				executionMode = "preview"
			}
			if mode == "cross_asset" {
				a.state.Media.Assets[mediaID].Organization = "org_demo_beta"
			}
			id := createOp(t, a, admin, "video_cliente", executionMode, map[string]string{"conversation_id": "conv_demo_alfa", "media_id": mediaID})
			if mode == "pause_during_worker" {
				j, ok, err := eq.ClaimOperation(context.Background())
				if !ok || err != nil {
					t.Fatal(err)
				}
				c := a.state.Conversations["conv_demo_alfa"]
				code, _ := req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/actions", admin, token(), map[string]any{"kind": "takeover", "reason": "Humano assume", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal(code)
				}
				r, _ := sdrsdk.ComputeAction(j.Plan)
				if err = eq.CompleteOperation(context.Background(), j, r); err == nil {
					t.Fatal("takeover allowed send")
				}
			} else {
				driveOps(t, a, eq, id)
			}
			if len(a.state.Messages["conv_demo_alfa"]) != 0 {
				t.Fatal("unapproved or preview send")
			}
			if mode == "approval" {
				if a.state.Platform.Executions[id].Status != "waiting_approval" {
					t.Fatal("approval bypassed")
				}
				if commandOp(t, a, admin, id, "approve") != 200 {
					t.Fatal("approve failed")
				}
				driveOps(t, a, eq, id)
				if len(a.state.Messages["conv_demo_alfa"]) != 1 {
					t.Fatal("approved send missing")
				}
			}
		})
	}
}

func TestClientMediaScheduleAndFinalRevocation(t *testing.T) {
	for _, action := range []string{"due", "cancel_schedule", "pause_resume", "new_input", "disable_tool", "expire", "opt_out", "cancel_message"} {
		t.Run(action, func(t *testing.T) {
			a, creds, _, eq, now := pipelineApp(t)
			admin := login(t, a, creds, "alfa.admin")
			mq := enableMediaTest(t, a)
			mediaID := preparedLibraryVideo(t, a, admin, mq)
			publishPlatform(t, a, admin, mediaFlow("automatic"))
			code, out := req(a, "POST", "/v1/platform/executions", admin, token(), map[string]any{"workflow_id": "video_cliente", "mode": "apply", "source": "published", "not_before": now.Add(time.Minute), "input": map[string]string{"conversation_id": "conv_demo_alfa", "media_id": mediaID}})
			if code != 202 {
				t.Fatal(code, out)
			}
			id := out["execution"].(map[string]any)["id"].(string)
			if _, ok, err := eq.ClaimOperation(context.Background()); ok || err != nil {
				t.Fatal("ran before due", err)
			}
			if action == "cancel_schedule" && commandOp(t, a, admin, id, "cancel") != 200 {
				t.Fatal("cannot cancel schedule")
			}
			if action == "pause_resume" {
				a.state.Generation["conv_demo_alfa"] += 2
			}
			*now = now.Add(61 * time.Second)
			driveOps(t, a, eq, id)
			ms := a.state.Messages["conv_demo_alfa"]
			if action == "cancel_schedule" || action == "pause_resume" {
				if len(ms) != 0 {
					t.Fatal("cancelled scheduled send ran")
				}
				return
			}
			if len(ms) != 1 {
				t.Fatal("due send missing")
			}
			c := a.state.Conversations["conv_demo_alfa"]
			switch action {
			case "new_input":
				c.InputVersion++
			case "disable_tool":
				cfg := mediaFlow("automatic")
				cfg.Tools[0].Enabled = false
				publishPlatform(t, a, admin, cfg)
			case "expire":
				a.state.Media.Assets[mediaID].Expires = *now
			case "opt_out":
				c.OptedOut = true
			case "cancel_message":
				code, out = req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/messages/"+ms[0].ID+"/cancel", admin, token(), map[string]any{"reason": "Cliente cancelou envio", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal(code, out)
				}
			}
			if err := a.Drain(); err != nil {
				t.Fatal(err)
			}
			status := a.state.Messages[c.ID][0].Status
			want := "cancelled"
			if action == "due" {
				want = "sent"
			}
			if status != want {
				t.Fatal(action, status, want)
			}
		})
	}
}

func TestClientVideoUsesExistingWhatsAppPermitAndCannotCancelStartedSend(t *testing.T) {
	a, creds, f, _, eq, _, admin := realSetup(t)
	mq := enableMediaTest(t, a)
	mediaID := preparedLibraryVideo(t, a, admin, mq)
	f.inbox = []realInbound{realEvent(a)}
	if err := a.TransportTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.inbox = nil
	var c *Conversation
	for _, candidate := range a.state.Conversations {
		if candidate.Channel == "whatsapp" {
			c = candidate
		}
	}
	if c == nil {
		t.Fatal("no channel conversation")
	}
	publishPlatform(t, a, admin, mediaFlow("automatic"))
	id := createOp(t, a, admin, "video_cliente", "apply", map[string]string{"conversation_id": c.ID, "media_id": mediaID, "caption": "Vídeo configurado pelo cliente"})
	driveOps(t, a, eq, id)
	m := a.state.Messages[c.ID][1]
	if err := a.TransportTick(context.Background()); err != nil {
		t.Fatal(err)
	}
	envelope := f.out[m.ID]
	if envelope.MediaID != mediaID || envelope.MediaKind != "video" || !envelope.Automatic {
		t.Fatal("video bypassed regular transport", envelope)
	}
	if status := permit(t, a, envelope, "client_video_claim"); status != 200 {
		t.Fatal("permit rejected", status)
	}
	if code, _ := req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/messages/"+m.ID+"/cancel", admin, token(), map[string]any{"reason": "Tarde demais", "expected_revision": c.Revision}); code != 409 {
		t.Fatal("started send treated as cancellable", code)
	}
	viewer := login(t, a, creds, "alfa.viewer")
	if code, _ := req(a, "GET", "/v1/sdr/conversations/"+c.ID+"/messages/"+m.ID, viewer, "", nil); code != 200 {
		t.Fatal("viewer cannot read own status", code)
	}
}

func TestClientMediaSchedulePersistsAndRejectsAssetExpiry(t *testing.T) {
	a, creds, _, _, now := pipelineApp(t)
	admin := login(t, a, creds, "alfa.admin")
	mq := enableMediaTest(t, a)
	mediaID := preparedLibraryVideo(t, a, admin, mq)
	publishPlatform(t, a, admin, mediaFlow("automatic"))
	body := map[string]any{"workflow_id": "video_cliente", "mode": "apply", "source": "published", "not_before": now.Add(time.Hour), "input": map[string]string{"conversation_id": "conv_demo_alfa", "media_id": mediaID}}
	key := token()
	code, out := req(a, "POST", "/v1/platform/executions", admin, key, body)
	if code != 202 {
		t.Fatal(code, out)
	}
	id := out["execution"].(map[string]any)["id"].(string)
	file := a.file
	a.Close()
	restart, keys, err := newApp(file)
	if err != nil {
		t.Fatal(err)
	}
	defer restart.Close()
	restart.now = func() time.Time { return *now }
	e := restart.state.Platform.Executions[id]
	if e.NotBefore != now.Add(time.Hour) || e.MediaTargets["envio"].Conversation != "conv_demo_alfa" {
		t.Fatal("schedule or target fence lost")
	}
	admin = login(t, restart, keys, "alfa.admin")
	if code, out = req(restart, "POST", "/v1/platform/executions", admin, key, body); code != 202 || out["duplicate"] != true {
		t.Fatal("request duplicated after restart", code, out)
	}
	body["not_before"] = now.Add(7 * 24 * time.Hour)
	code, out = req(restart, "POST", "/v1/platform/executions", admin, token(), body)
	if code != 422 || out["error"] != "media_expires_before_schedule" {
		t.Fatal("scheduled expired asset", code, out)
	}
}
