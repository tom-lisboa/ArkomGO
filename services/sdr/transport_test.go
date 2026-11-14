package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

type fakeReal struct {
	fakeWA
	policies map[string]transportPolicy
	inbox    []realInbound
	acks     int
	out      map[string]realEnvelope
	results  map[string]realResult
	ackFail  bool
}

func (f *fakeReal) PutMessaging(_ context.Context, org string, p transportPolicy) error {
	f.policies[org] = p
	return nil
}
func (f *fakeReal) Inbox(_ context.Context, org string) ([]realInbound, error) {
	out := []realInbound{}
	for _, v := range f.inbox {
		if v.Organization == org {
			out = append(out, v)
		}
	}
	return out, nil
}
func (f *fakeReal) AckInbox(_ context.Context, org, id string) error {
	f.acks++
	if f.ackFail {
		return context.DeadlineExceeded
	}
	return nil
}
func (f *fakeReal) Enqueue(_ context.Context, e realEnvelope) (realResult, error) {
	if old, ok := f.out[e.ID]; ok && old != e {
		return realResult{}, context.Canceled
	}
	f.out[e.ID] = e
	if r, ok := f.results[e.ID]; ok {
		return r, nil
	}
	return realResult{Status: "queued"}, nil
}
func (f *fakeReal) Delivery(_ context.Context, org, id string) (realResult, error) {
	if r, ok := f.results[id]; ok {
		return r, nil
	}
	return realResult{Status: "queued"}, nil
}
func realSetup(t *testing.T) (*App, map[string]string, *fakeReal, *sdrsdk.Client, *sdrsdk.Client, *time.Time, string) {
	a, keys, cq, eq, now := pipelineApp(t)
	f := &fakeReal{policies: map[string]transportPolicy{}, out: map[string]realEnvelope{}, results: map[string]realResult{}}
	a.wa = f
	admin := login(t, a, keys, "alfa.admin")
	raw, _ := json.Marshal(WhatsAppView{Status: "connected"})
	if _, e := a.db.Exec("UPDATE whatsapp_channels SET view=? WHERE organization_id='org_demo_alfa'", raw); e != nil {
		t.Fatal(e)
	}
	p := a.state.Transport.Policies["org_demo_alfa"]
	code, b := req(a, "POST", "/v1/sdr/whatsapp/messaging", admin, token(), map[string]any{"enabled": true, "test_phones": []string{"5511999999999"}, "expected_revision": p.Revision, "reason": "Ativar primeiro contato fictício do transporte"})
	if code != 200 {
		t.Fatal(code, b)
	}
	return a, keys, f, cq, eq, now, admin
}
func realEvent(a *App) realInbound {
	p := a.state.Transport.Policies["org_demo_alfa"]
	return realInbound{ID: "00000000-0000-0000-0000-000000000001", Organization: "org_demo_alfa", Epoch: p.Epoch, ProviderID: "WA_TEST_1", Target: "5511999999999@s.whatsapp.net", Name: "Ana", Text: "Sou Ana e quero o plano Essencial", At: a.now()}
}
func realReply(t *testing.T, a *App, f *fakeReal, cq, eq *sdrsdk.Client, now *time.Time) (string, string) {
	t.Helper()
	f.inbox = []realInbound{realEvent(a)}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	id := ""
	for k, c := range a.state.Conversations {
		if c.Channel == "whatsapp" {
			id = k
		}
	}
	if id == "" {
		t.Fatal("no real conversation")
	}
	*now = now.Add(6 * time.Second)
	prepare(t, cq)
	w := executionworker.Worker{Queue: eq, Planner: mockPlanner{Call: func(c sdrsdk.Prepared) sdrsdk.Outcome {
		o := answer()
		o.Decision.Facts[0].MessageID = c.History[0].ID
		return o
	}}}
	if _, e := w.Once(context.Background()); e != nil {
		t.Fatal(e)
	}
	f.inbox = nil
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	ms := a.state.Messages[id]
	return id, ms[len(ms)-1].ID
}
func permit(t *testing.T, a *App, e realEnvelope, claim string) int {
	t.Helper()
	old := a.wa
	a.wa = &engineClient{secret: strings.Repeat("z", 48)}
	defer func() { a.wa = old }()
	raw, _ := json.Marshal(map[string]any{"envelope": e, "claim": claim})
	r := httptest.NewRequest("POST", "/internal/transport/authorize", bytes.NewReader(raw))
	r.Header.Set("Authorization", "Bearer "+strings.Repeat("z", 48))
	w := httptest.NewRecorder()
	a.privateWorkers().ServeHTTP(w, r)
	return w.Code
}
func TestTransportWaitsForNewCompanyProvisioning(t *testing.T) {
	a, _, engine, _, _, _, _ := realSetup(t)
	ctx := context.Background()
	if err := a.TransportTick(ctx); err != nil {
		t.Fatal(err)
	}
	if _, sent := engine.policies["org_demo_beta"]; sent {
		t.Fatal("unprovisioned company policy reached gateway")
	}
	if _, err := a.db.Exec("INSERT INTO whatsapp_channels(organization_id,provisioning) VALUES('org_demo_beta','ready')"); err != nil {
		t.Fatal(err)
	}
	if err := a.TransportTick(ctx); err != nil {
		t.Fatal(err)
	}
	if _, sent := engine.policies["org_demo_beta"]; !sent {
		t.Fatal("initial policy was not synchronized after provisioning")
	}
}

func TestRealTransportContextSendAndProviderConfirmation(t *testing.T) {
	a, _, f, cq, eq, now, _ := realSetup(t)
	id, mid := realReply(t, a, f, cq, eq, now)
	if e := a.Drain(); e != nil {
		t.Fatal(e)
	}
	if a.state.Messages[id][1].Status != "queued" {
		t.Fatal("fake delivery handled real message")
	}
	env := f.out[mid]
	if env.Organization != "org_demo_alfa" || env.Target != realEvent(a).Target || !env.Automatic {
		t.Fatal("wrong envelope")
	}
	forged := env
	forged.Text = "Mensagem alterada"
	if permit(t, a, forged, "claim-1") != 409 {
		t.Fatal("forged send permitted")
	}
	if permit(t, a, env, "claim-1") != 200 || permit(t, a, env, "claim-1") != 409 {
		t.Fatal("permit replay")
	}
	if a.state.Messages[id][1].Status != "sending" {
		t.Fatal("send authorization not durable")
	}
	f.results[mid] = realResult{Status: "sent", ProviderID: "WA_CONFIRMED"}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if a.state.Messages[id][1].Status != "sent" || a.state.Transport.Deliveries[mid].ProviderID != "WA_CONFIRMED" {
		t.Fatal("provider confirmation not applied")
	}
	if a.state.Pipeline.Memory[id]["name"].Value != "Ana" {
		t.Fatal("real context did not retain memory")
	}
}
func TestRealTransportDeduplicatesBeforeAckAndRollsBack(t *testing.T) {
	a, _, f, _, _, _, _ := realSetup(t)
	v := realEvent(a)
	a.failSave = true
	if a.ingestReal(v) == nil || a.state.Transport.Received[v.Organization+":"+v.ID] {
		t.Fatal("failed save acknowledged")
	}
	a.failSave = false
	f.inbox = []realInbound{v}
	f.ackFail = true
	if a.TransportTick(context.Background()) == nil {
		t.Fatal("missing ack failure")
	}
	f.ackFail = false
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	count := 0
	for _, c := range a.state.Conversations {
		if c.Channel == "whatsapp" {
			count += len(a.state.Messages[c.ID])
		}
	}
	if count != 1 || f.acks != 2 {
		t.Fatal("duplicate ingestion", count, f.acks)
	}
	bad := v
	bad.ID = "event-unapproved"
	bad.Target = "5521999999999@s.whatsapp.net"
	if a.ingestReal(bad) == nil {
		t.Fatal("unapproved target")
	}
	bad = v
	bad.ID = "event-beta"
	bad.Organization = "org_demo_beta"
	if a.ingestReal(bad) == nil {
		t.Fatal("cross company input")
	}
}
func TestRealTransportPauseOptOutAndDisabledFence(t *testing.T) {
	for _, kind := range []string{"pause", "takeover", "phone_takeover", "optout", "disabled", "new_input"} {
		t.Run(kind, func(t *testing.T) {
			a, _, f, cq, eq, now, tok := realSetup(t)
			id, mid := realReply(t, a, f, cq, eq, now)
			c := a.state.Conversations[id]
			switch kind {
			case "pause", "takeover":
				code, b := req(a, "POST", "/v1/sdr/conversations/"+id+"/actions", tok, token(), map[string]any{"kind": kind, "reason": "Equipe assumiu", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal(code, b)
				}
			case "phone_takeover":
				v := realEvent(a)
				v.ID, v.Human, v.Text = "manual-from-phone", true, "Olá, vou assumir o atendimento."
				f.inbox = []realInbound{v, v}
				if e := a.TransportTick(context.Background()); e != nil {
					t.Fatal(e)
				}
				f.inbox = nil
				messages := a.state.Messages[id]
				if c.Automation != "human" || len(messages) != 3 || messages[2].Author != "human" || messages[2].Status != "sent" || len(f.out) != 1 {
					t.Fatal("manual send did not take over or was sent again")
				}
			case "optout":
				v := realEvent(a)
				v.ID = "optout-event"
				v.Text = "Pare de me enviar mensagens"
				if e := a.ingestReal(v); e != nil {
					t.Fatal(e)
				}
			case "disabled":
				p := a.state.Transport.Policies[c.Org]
				p.Enabled = false
				a.state.Transport.Policies[c.Org] = p
			case "new_input":
				v := realEvent(a)
				v.ID = "new-event"
				v.Text = "Correção: meu nome é Beatriz"
				if e := a.ingestReal(v); e != nil {
					t.Fatal(e)
				}
			}
			if permit(t, a, f.out[mid], "old-claim") != 409 {
				t.Fatal("stale automatic message permitted")
			}
			if kind == "phone_takeover" {
				v := realEvent(a)
				v.ID = "lead-after-phone-takeover"
				if e := a.ingestReal(v); e != nil || a.state.Pipeline.Windows[id].Status == "pending" || a.state.Pipeline.Windows[id].Status == "running" {
					t.Fatal("new lead message reactivated the SDR", e)
				}
				code, body := req(a, "POST", "/v1/sdr/conversations/"+id+"/actions", tok, token(), map[string]any{"kind": "resume", "reason": "Equipe devolveu o atendimento", "expected_revision": c.Revision})
				if code != 200 {
					t.Fatal(code, body)
				}
				v.ID = "lead-after-resume"
				if e := a.ingestReal(v); e != nil || a.state.Pipeline.Windows[id].Status != "pending" {
					t.Fatal("explicit resume did not enable the next answer", e)
				}
			}
		})
	}
}
func TestRealTransportRolesHumanReplyAndUncertainNoRetry(t *testing.T) {
	a, keys, f, cq, eq, now, admin := realSetup(t)
	id, mid := realReply(t, a, f, cq, eq, now)
	viewer := login(t, a, keys, "alfa.viewer")
	beta := login(t, a, keys, "beta.admin")
	if code, _ := req(a, "POST", "/v1/sdr/whatsapp/messaging", viewer, token(), map[string]any{}); code != 403 {
		t.Fatal("viewer activation")
	}
	if code, _ := req(a, "GET", "/v1/sdr/conversations/"+id, beta, "", nil); code != 404 {
		t.Fatal("real conversation exposed")
	}
	if code, _ := req(a, "POST", "/__test/ui/inbound", admin, "", map[string]any{"provider_event_id": "forged-test", "conversation_id": id, "text": "Fake injection"}); code != 422 {
		t.Fatal("simulated input sent to real channel")
	}
	if permit(t, a, f.out[mid], "dispatch-once") != 200 {
		t.Fatal("authorize")
	}
	f.results[mid] = realResult{Status: "uncertain"}
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	before := len(f.out)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if a.state.Messages[id][1].Status != "uncertain" || len(f.out) != before {
		t.Fatal("uncertain send replayed")
	}
	c := a.state.Conversations[id]
	code, _ := req(a, "POST", "/v1/sdr/conversations/"+id+"/actions", admin, token(), map[string]any{"kind": "takeover", "expected_revision": c.Revision, "reason": "Equipe responde"})
	if code != 200 {
		t.Fatal(code)
	}
	c = a.state.Conversations[id]
	code, b := req(a, "POST", "/v1/sdr/conversations/"+id+"/messages", admin, token(), map[string]any{"text": "Resposta humana real de teste", "expected_revision": c.Revision})
	if code != 202 {
		t.Fatal(code, b)
	}
	human := b["message"].(map[string]any)["id"].(string)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if f.out[human].Automatic || permit(t, a, f.out[human], "human-claim") != 200 {
		t.Fatal("human reply not authorized")
	}
}

func TestRealTransportRestartKeepsDispatchConsumed(t *testing.T) {
	a, _, f, cq, eq, now, _ := realSetup(t)
	_, mid := realReply(t, a, f, cq, eq, now)
	env := f.out[mid]
	if permit(t, a, env, "durable-claim") != 200 {
		t.Fatal("authorize")
	}
	file := a.file
	if e := a.Close(); e != nil {
		t.Fatal(e)
	}
	restored, _, e := newApp(file)
	if e != nil {
		t.Fatal(e)
	}
	defer restored.Close()
	restored.wa = f
	restored.pipelineEnabled = true
	if restored.state.Transport.Deliveries[mid].Status != "sending" || permit(t, restored, env, "durable-claim") != 409 {
		t.Fatal("restart allowed another send")
	}
	f.results[mid] = realResult{Status: "sent", ProviderID: "WA_ACK_AFTER_API_RESTART"}
	if e = restored.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if restored.state.Transport.Deliveries[mid].Status != "sent" {
		t.Fatal("reconciliation failed")
	}
}

func TestRealTransportHumanRepliesStayOrdered(t *testing.T) {
	a, _, f, cq, eq, now, tok := realSetup(t)
	id, mid := realReply(t, a, f, cq, eq, now)
	c := a.state.Conversations[id]
	code, _ := req(a, "POST", "/v1/sdr/conversations/"+id+"/actions", tok, token(), map[string]any{"kind": "takeover", "expected_revision": c.Revision, "reason": "Equipe responde duas mensagens"})
	if code != 200 {
		t.Fatal(code)
	}
	for _, text := range []string{"Primeira resposta humana", "Segunda resposta humana"} {
		c = a.state.Conversations[id]
		code, _ = req(a, "POST", "/v1/sdr/conversations/"+id+"/messages", tok, token(), map[string]any{"text": text, "expected_revision": c.Revision})
		if code != 202 {
			t.Fatal(code)
		}
	}
	delete(f.out, mid)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if len(f.out) != 1 {
		t.Fatal("both replies queued together", len(f.out))
	}
	var first realEnvelope
	for _, v := range f.out {
		first = v
	}
	if first.Text != "Primeira resposta humana" {
		t.Fatal("out of order")
	}
	f.results[first.ID] = realResult{Status: "sent"}
	a.TransportTick(context.Background())
	a.TransportTick(context.Background())
	found := false
	for _, v := range f.out {
		if v.Text == "Segunda resposta humana" {
			found = true
		}
	}
	if !found {
		t.Fatal("second reply not advanced after ack")
	}
}

func TestRealTransportAcceptsFullUnicodeHumanText(t *testing.T) {
	a, _, f, cq, eq, now, tok := realSetup(t)
	id, _ := realReply(t, a, f, cq, eq, now)
	c := a.state.Conversations[id]
	code, b := req(a, "POST", "/v1/sdr/conversations/"+id+"/actions", tok, token(), map[string]any{"kind": "takeover", "reason": "Equipe responde", "expected_revision": c.Revision})
	if code != 200 {
		t.Fatal(code, b)
	}
	c = a.state.Conversations[id]
	text := strings.Repeat("😀", 4000)
	code, b = req(a, "POST", "/v1/sdr/conversations/"+id+"/messages", tok, token(), map[string]any{"text": text, "expected_revision": c.Revision})
	if code != 202 {
		t.Fatal("valid Unicode message rejected", code, b)
	}
	mid := b["message"].(map[string]any)["id"].(string)
	if e := a.TransportTick(context.Background()); e != nil {
		t.Fatal(e)
	}
	if permit(t, a, f.out[mid], "unicode-claim") != 200 {
		t.Fatal("valid Unicode envelope rejected")
	}
}
