package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"sdr-next-pilot/internal/mediaworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func fixturePNG() []byte {
	var b bytes.Buffer
	im := image.NewRGBA(image.Rect(0, 0, 2, 2))
	im.Set(0, 0, color.RGBA{R: 100, A: 255})
	_ = png.Encode(&b, im)
	return b.Bytes()
}
func fixtureWAV() []byte {
	b := make([]byte, 44+3200)
	copy(b, "RIFF")
	binary.LittleEndian.PutUint32(b[4:], uint32(len(b)-8))
	copy(b[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(b[16:], 16)
	binary.LittleEndian.PutUint16(b[20:], 1)
	binary.LittleEndian.PutUint16(b[22:], 1)
	binary.LittleEndian.PutUint32(b[24:], 16000)
	binary.LittleEndian.PutUint32(b[28:], 32000)
	binary.LittleEndian.PutUint16(b[32:], 2)
	binary.LittleEndian.PutUint16(b[34:], 16)
	copy(b[36:], "data")
	binary.LittleEndian.PutUint32(b[40:], 3200)
	return b
}
func (f *fakeReal) ReadInboxMedia(_ context.Context, org, id string) ([]byte, error) {
	for _, v := range f.inbox {
		if v.ID == id && v.Organization == org && v.Media != nil {
			if v.Media.Kind == "audio" {
				return fixtureWAV(), nil
			}
			return fixturePNG(), nil
		}
	}
	return nil, context.Canceled
}
func enableMediaTest(t *testing.T, a *App) *sdrsdk.Client {
	t.Helper()
	a.mediaEnabled = true
	a.workerSecrets["media"] = sha256.Sum256([]byte("media-secret"))
	p := a.state.Transport.Policies["org_demo_alfa"]
	p.MediaEnabled = true
	a.state.Transport.Policies["org_demo_alfa"] = p
	srv := httptest.NewServer(a.privateWorkers())
	t.Cleanup(srv.Close)
	return &sdrsdk.Client{Base: srv.URL, Token: "media-secret", HTTP: srv.Client()}
}
func mediaCompleteFixture(t *testing.T, q *sdrsdk.Client, j sdrsdk.MediaJob, text string) sdrsdk.MediaResult {
	t.Helper()
	b, e := q.ReadMedia(context.Background(), j)
	if e != nil {
		t.Fatal(e)
	}
	f, e := sdrsdk.InspectMedia(b, j.File.Name)
	if e != nil {
		t.Fatal(e)
	}
	v := sdrsdk.MediaResult{File: f, Text: text}
	if j.Direction == "outbound" {
		v.Data = b
		v.Text = ""
	}
	if e = q.CompleteMedia(context.Background(), j, v); e != nil {
		t.Fatal(e)
	}
	return v
}
func TestMediaWaitsForAllPartsAndPreservesOrder(t *testing.T) {
	a, _, f, cq, eq, now, _ := realSetup(t)
	mq := enableMediaTest(t, a)
	v := realEvent(a)
	v.Text = ""
	v.Media = &sdrsdk.MediaFile{Kind: "audio", MIME: "audio/wav", Name: "fala.wav", Size: len(fixtureWAV())}
	f.inbox = []realInbound{v}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	*now = now.Add(2 * time.Second)
	v.ID = "media_image_2"
	v.ProviderID = "WA_IMAGE"
	v.At = *now
	v.Text = "Foto da minha loja"
	v.Media = &sdrsdk.MediaFile{Kind: "image", MIME: "image/png", Name: "foto.png", Size: len(fixturePNG())}
	f.inbox = append(f.inbox, v)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	*now = now.Add(2 * time.Second)
	v.ID = "media_text_3"
	v.ProviderID = "WA_TEXT"
	v.At = *now
	v.Text = "Qual plano atende dois vendedores?"
	v.Media = nil
	f.inbox = append(f.inbox, v)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	*now = now.Add(31 * time.Second)
	if _, worked, e := cq.ClaimContext(context.Background()); worked || e != nil {
		t.Fatal("claimed an unread media window", worked, e)
	}
	j1, ok, e := mq.ClaimMedia(context.Background())
	if e != nil || !ok {
		t.Fatal(e)
	}
	j2, ok, e := mq.ClaimMedia(context.Background())
	if e != nil || !ok {
		t.Fatal(e)
	}
	mediaCompleteFixture(t, mq, j2, "A imagem mostra uma loja de veículos.")
	if _, worked, e := cq.ClaimContext(context.Background()); worked || e != nil {
		t.Fatal("did not wait for the audio", e)
	}
	complete := mediaCompleteFixture(t, mq, j1, "Sou Ana, da Loja Horizonte. Temos dois vendedores.")
	if e = mq.CompleteMedia(context.Background(), j1, complete); e != nil {
		t.Fatal("completion replay", e)
	}
	if _, worked, _ := cq.ClaimContext(context.Background()); worked {
		t.Fatal("media settle window ignored")
	}
	*now = now.Add(4 * time.Second)
	prepare(t, cq)
	execution, worked, e := eq.ClaimExecution(context.Background())
	if e != nil || !worked {
		t.Fatal(e)
	}
	history := execution.Context.History
	if len(execution.Context.InputIDs) != 3 || len(history) != 3 || !strings.Contains(history[0].Text, "Sou Ana") || !strings.Contains(history[1].Text, "Legenda: Foto da minha loja") || history[2].Text != "Qual plano atende dois vendedores?" {
		t.Fatal("media/text order or content lost")
	}
	if strings.Count(history[0].Text, "Sou Ana") != 1 {
		t.Fatal("duplicate transcript")
	}
}
func TestMediaTimeoutHandsOffWithoutInventingContent(t *testing.T) {
	a, _, f, cq, _, now, _ := realSetup(t)
	enableMediaTest(t, a)
	v := realEvent(a)
	v.Text = ""
	v.Media = &sdrsdk.MediaFile{Kind: "audio", Name: "audio.wav"}
	f.inbox = []realInbound{v}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	*now = now.Add(121 * time.Second)
	_, worked, e := cq.ClaimContext(context.Background())
	if e != nil || worked {
		t.Fatal(e)
	}
	for _, c := range a.state.Conversations {
		if c.Channel == "whatsapp" {
			m := a.state.Messages[c.ID][0]
			if c.Automation != "human" || m.Media.Status != "failed" || m.Text != "[Mídia não interpretada; requer conferência da equipe]" {
				t.Fatal("media timeout not explicit")
			}
		}
	}
}
func TestMediaTranscriptOptoutAndHumanTakeoverFence(t *testing.T) {
	for _, stop := range []bool{false, true} {
		t.Run(map[bool]string{false: "takeover", true: "spoken-optout"}[stop], func(t *testing.T) {
			a, _, f, cq, _, now, admin := realSetup(t)
			mq := enableMediaTest(t, a)
			v := realEvent(a)
			v.Text = ""
			v.Media = &sdrsdk.MediaFile{Kind: "audio", Name: "audio.wav"}
			f.inbox = []realInbound{v}
			if e := a.TransportTick(context.Background()); e != nil {
				t.Fatal(e)
			}
			j, ok, e := mq.ClaimMedia(context.Background())
			if !ok || e != nil {
				t.Fatal(e)
			}
			if !stop {
				c := a.state.Conversations[j.Conversation]
				code, b := req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/actions", admin, token(), map[string]any{"kind": "takeover", "reason": "Conferir o áudio", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal(code, b)
				}
			}
			text := "Sou Ana."
			if stop {
				text = "Não me envie mais mensagens"
			}
			mediaCompleteFixture(t, mq, j, text)
			*now = now.Add(31 * time.Second)
			if _, worked, _ := cq.ClaimContext(context.Background()); worked {
				t.Fatal("automated context after human/optout")
			}
			c := a.state.Conversations[j.Conversation]
			if stop && !c.OptedOut {
				t.Fatal("spoken optout lost")
			}
			if !stop && c.Automation != "human" {
				t.Fatal("takeover overwritten")
			}
		})
	}
}
func uploadFixture(a *App, tok, conv, key string, b []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	file, _ := form.CreateFormFile("file", "imagem.png")
	_, _ = file.Write(b)
	_ = form.Close()
	r := httptest.NewRequest("POST", "/v1/sdr/conversations/"+conv+"/media", &body)
	r.Header.Set("Content-Type", form.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+tok)
	r.Header.Set("Idempotency-Key", key)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}
func TestMediaUploadIsolationPersistenceAndSendFence(t *testing.T) {
	a, creds, f, _, _, _, admin := realSetup(t)
	mq := enableMediaTest(t, a)
	v := realEvent(a)
	if e := a.ingestReal(v); e != nil {
		t.Fatal(e)
	}
	var c *Conversation
	for _, candidate := range a.state.Conversations {
		if candidate.Channel == "whatsapp" {
			c = candidate
		}
	}
	code, b := req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/actions", admin, token(), map[string]any{"kind": "takeover", "reason": "Responder com imagem", "expected_revision": c.Revision})
	if code != 200 {
		t.Fatal(code, b)
	}
	key := token()
	w := uploadFixture(a, admin, c.ID, key, fixturePNG())
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	var uploaded struct{ Asset MediaAsset }
	if json.Unmarshal(w.Body.Bytes(), &uploaded) != nil {
		t.Fatal("invalid upload reply")
	}
	id := uploaded.Asset.ID
	w = uploadFixture(a, admin, c.ID, key, fixturePNG())
	if w.Code != 202 || len(a.state.Media.Jobs) != 1 {
		t.Fatal("upload replay duplicated asset")
	}
	beta := login(t, a, creds, "beta.admin")
	code, _ = req(a, "GET", "/v1/sdr/media/"+id, beta, "", nil)
	if code != 404 {
		t.Fatal("cross company asset visible")
	}
	viewer := login(t, a, creds, "alfa.viewer")
	if got := uploadFixture(a, viewer, c.ID, token(), fixturePNG()); got.Code != 403 {
		t.Fatal("viewer uploaded media")
	}
	j, ok, e := mq.ClaimMedia(context.Background())
	if !ok || e != nil {
		t.Fatal(e)
	}
	data, e := mq.ReadMedia(context.Background(), j)
	if e != nil {
		t.Fatal(e)
	}
	file, _ := sdrsdk.InspectMedia(data, j.File.Name)
	result := sdrsdk.MediaResult{Data: data, File: file}
	a.failSave = true
	e = mq.CompleteMedia(context.Background(), j, result)
	a.failSave = false
	if e != sdrsdk.ErrUnavailable || a.state.Media.Assets[id].Status == "ready" {
		t.Fatal("failed commit exposed a prepared asset", e)
	}
	if e = mq.CompleteMedia(context.Background(), j, result); e != nil {
		t.Fatal("completion retry", e)
	}
	code, b = req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/messages", admin, token(), map[string]any{"text": "Esta é a imagem.", "media_id": id, "expected_revision": a.state.Conversations[c.ID].Revision})
	if code != 202 {
		t.Fatal(code, b)
	}
	if e = a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	var envelope realEnvelope
	for _, v := range f.out {
		envelope = v
	}
	if envelope.MediaID != id || envelope.MediaSHA256 != file.SHA256 || envelope.MediaSize != len(data) {
		t.Fatal("media identity lost in outbox")
	}
	a.wa = &engineClient{secret: strings.Repeat("x", 48)}
	body, _ := json.Marshal(map[string]any{"envelope": envelope, "claim": "claim_media"})
	r := httptest.NewRequest("POST", "/internal/transport/media", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+strings.Repeat("x", 48))
	out := httptest.NewRecorder()
	a.privateWorkers().ServeHTTP(out, r)
	if out.Code != 200 || !bytes.Equal(out.Body.Bytes(), data) {
		t.Fatal("media not scoped to delivery", out.Code)
	}
	c = a.state.Conversations[c.ID]
	code, b = req(a, "POST", "/v1/sdr/conversations/"+c.ID+"/actions", admin, token(), map[string]any{"kind": "pause", "reason": "Interromper envio", "expected_revision": c.Revision})
	if code != 200 {
		t.Fatal(code, b)
	}
	r = httptest.NewRequest("POST", "/internal/transport/media", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+strings.Repeat("x", 48))
	out = httptest.NewRecorder()
	a.privateWorkers().ServeHTTP(out, r)
	if out.Code != 409 {
		t.Fatal("paused delivery exposed media", out.Code)
	}
	if a.state.Media.Assets[id].Status != "ready" {
		t.Fatal("pause deleted the customer asset")
	}
}

type delayedMediaSource struct {
	*fakeReal
	waiting bool
}

func (d *delayedMediaSource) ReadInboxMedia(ctx context.Context, org, id string) ([]byte, error) {
	if d.waiting {
		return nil, sdrsdk.ErrMediaPending
	}
	return d.fakeReal.ReadInboxMedia(ctx, org, id)
}

type mediaProcessorFixture struct{}

func (mediaProcessorFixture) Process(_ context.Context, j sdrsdk.MediaJob, b []byte) (sdrsdk.MediaResult, error) {
	file, e := sdrsdk.InspectMedia(b, j.File.Name)
	return sdrsdk.MediaResult{File: file, Text: "Sou Ana, esta é minha mensagem."}, e
}
func TestMediaWaitsForDownloadWithoutExhaustingProcessingAttempts(t *testing.T) {
	a, _, f, _, _, now, _ := realSetup(t)
	mq := enableMediaTest(t, a)
	source := &delayedMediaSource{fakeReal: f, waiting: true}
	a.wa = source
	v := realEvent(a)
	v.Text = ""
	v.Media = &sdrsdk.MediaFile{Kind: "audio", Name: "audio.wav"}
	f.inbox = []realInbound{v}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	worker := mediaworker.Worker{Queue: mq, Processor: mediaProcessorFixture{}}
	for i := 0; i < 5; i++ {
		worked, e := worker.Once(context.Background())
		if !worked || e != nil {
			t.Fatal(e)
		}
		*now = now.Add(3 * time.Second)
	}
	for _, j := range a.state.Media.Jobs {
		if j.Attempts != 0 || j.Status != "pending" || a.state.Conversations[j.Conversation].Automation != "active" {
			t.Fatal("download delay consumed model attempts")
		}
	}
	source.waiting = false
	if worked, e := worker.Once(context.Background()); !worked || e != nil {
		t.Fatal(e)
	}
	for _, asset := range a.state.Media.Assets {
		if asset.Status != "ready" {
			t.Fatal("completed source not interpreted")
		}
	}
}
func TestSlowMediaUploadDoesNotBlockOtherRequests(t *testing.T) {
	a, creds, _, _, _, _, admin := realSetup(t)
	enableMediaTest(t, a)
	a.state.Conversations["conv_demo_alfa"].Automation = "human"
	reader, writer := io.Pipe()
	form := multipart.NewWriter(writer)
	ready := make(chan struct{})
	release := make(chan struct{})
	done := make(chan int, 1)
	go func() {
		_, e := form.CreateFormFile("file", "slow.png")
		if e == nil {
			close(ready)
			<-release
		}
		_ = form.Close()
		_ = writer.Close()
	}()
	r := httptest.NewRequest("POST", "/v1/sdr/conversations/conv_demo_alfa/media", reader)
	r.Header.Set("Authorization", "Bearer "+admin)
	r.Header.Set("Content-Type", form.FormDataContentType())
	r.Header.Set("Idempotency-Key", token())
	go func() { w := httptest.NewRecorder(); a.Handler().ServeHTTP(w, r); done <- w.Code }()
	select {
	case <-ready:
	case <-time.After(time.Second):
		close(release)
		reader.Close()
		t.Fatal("upload did not start")
	}
	response := make(chan int, 1)
	go func() { code, _ := req(a, "GET", "/v1/sdr/runtime", admin, "", nil); response <- code }()
	select {
	case code := <-response:
		if code != 200 {
			t.Error(code)
		}
	case <-time.After(time.Second):
		t.Error("upload held the global application lock")
	}
	close(release)
	reader.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("upload did not finish")
	}
	_ = creds
}

func TestSentAttachmentIsRepresentedInContextWithoutInventingItsContent(t *testing.T) {
	a, _, _, _, _ := pipelineApp(t)
	c := a.state.Conversations["conv_demo_alfa"]
	m := a.message(c, "", "human")
	list := a.state.Messages[c.ID]
	list[len(list)-1].Status = "sent"
	list[len(list)-1].Media = &MessageMedia{ID: "asset", Kind: "audio", Name: "audio.ogg", Status: "ready"}
	a.state.Messages[c.ID] = list
	lead := a.message(c, "Sobre o áudio que recebi...", "lead")
	a.queueContext(c, lead.ID)
	candidate, ok := a.rawCandidate(c, a.state.Pipeline.Windows[c.ID])
	if !ok || len(candidate.History) != 2 || candidate.History[0].ID != m.ID || !strings.Contains(candidate.History[0].Text, "Anexo enviado: audio") || !strings.Contains(candidate.History[0].Text, "não foi interpretado") {
		t.Fatal("sent attachment lost from history or fabricated content")
	}
}
