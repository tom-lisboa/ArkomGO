package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sdr-next-pilot/internal/executionworker"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func TestCRMOutboxRetriesSameEvent(t *testing.T) {
	const org = "c8e8427a-2a48-4e1f-87df-3f88fc9131ec"
	const install = "0442411f-6b3c-42a2-b839-b553383c2be1"
	const lead = "93d862a9-7d2a-4d91-ac54-8380de4c1f0f"
	token := "arkom_service_" + strings.Repeat("A", 43)

	var received []crmEvent
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event crmEvent
		if r.Method != http.MethodPost || r.URL.Path != "/integration/v1/events" ||
			r.Header.Get("Authorization") != "Bearer "+token ||
			r.Header.Get("X-Organization-ID") != org || json.NewDecoder(r.Body).Decode(&event) != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		received = append(received, event)
		if len(received) == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	db := filepath.Join(t.TempDir(), "state.sqlite")
	app, _, err := newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	routes := map[string]crmRoute{"local-org": {
		Origin: server.URL, Organization: org, Installation: install, Token: token,
		Contacts: map[string]string{"local-contact": lead},
	}}
	app.crmRoutes = routes
	if err := app.transact(func() {
		app.state.Conversations["crm-test"] = &Conversation{ID: "crm-test", Org: "local-org", Contact: "local-contact"}
		conversation := app.state.Conversations["crm-test"]
		app.state.Pipeline.Memory[conversation.ID] = map[string]sdrsdk.Fact{
			"company": {Value: "Empresa dev", ExpiresAt: app.now().Add(time.Hour)},
		}
		app.queueQualifiedCRM(conversation)
		if len(app.state.CRMOutbox) != 0 {
			t.Error("lead was queued without a goal")
		}
		app.state.Pipeline.Memory[conversation.ID]["goal"] = sdrsdk.Fact{Value: "Qualificar leads", ExpiresAt: app.now().Add(time.Hour)}
		app.queueQualifiedCRM(conversation)
	}); err != nil {
		t.Fatal(err)
	}
	app.flushCRM(context.Background(), server.Client())
	if len(app.state.CRMOutbox) != 1 {
		t.Fatal("failed publication discarded the event")
	}
	if err := app.Close(); err != nil {
		t.Fatal(err)
	}

	app, _, err = newApp(db)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	app.crmRoutes = routes
	app.flushCRM(context.Background(), server.Client())
	if len(received) != 2 || !reflect.DeepEqual(received[0], received[1]) || len(app.state.CRMOutbox) != 1 || app.state.CRMOutbox[received[1].ID].Data != nil {
		t.Fatal("retry did not deliver the same durable event")
	}
	event := received[1]
	if event.Subject != "crm-test" || event.Type != "bia-sdr.crm.opportunity-qualified.v1" ||
		event.Data["clickmax_lead_id"] != lead || event.Data["bia_installation_id"] != install {
		t.Fatal("CRM event did not preserve the conversation and route")
	}
}

// This fixture exercises the Bia publisher against an external local dev bus.
func TestCRMQualificationDevSmoke(t *testing.T) {
	origin := os.Getenv("BIA_CRM_SMOKE_ORIGIN")
	if origin == "" {
		t.Skip("requires a local development bus")
	}
	app, _, err := newApp(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	app.crmRoutes = map[string]crmRoute{"local-org": {
		Origin: origin, Organization: os.Getenv("BIA_CRM_SMOKE_ORG"), Installation: os.Getenv("BIA_CRM_SMOKE_INSTALL"),
		Token: os.Getenv("BIA_CRM_SMOKE_TOKEN"), Contacts: map[string]string{"local-contact": os.Getenv("BIA_CRM_SMOKE_LEAD")},
	}}
	if err := app.transact(func() {
		conversation := &Conversation{ID: "crm-test", Org: "local-org", Contact: "local-contact"}
		app.state.Pipeline.Memory[conversation.ID] = map[string]sdrsdk.Fact{
			"company": {Value: "Empresa fictícia Arkom", ExpiresAt: app.now().Add(time.Hour)},
			"goal":    {Value: "Validar o CRM dev", ExpiresAt: app.now().Add(time.Hour)},
		}
		app.queueQualifiedCRM(conversation)
	}); err != nil {
		t.Fatal(err)
	}
	app.flushCRM(context.Background(), &http.Client{Timeout: 8 * time.Second})
	if len(app.state.CRMOutbox) != 1 {
		t.Fatal("qualification did not produce an event")
	}
	for _, event := range app.state.CRMOutbox {
		if event.Data != nil {
			t.Fatal("the development bus did not accept the event")
		}
	}
}

func TestCRMContactQualifiesThroughBia(t *testing.T) {
	const org = "c8e8427a-2a48-4e1f-87df-3f88fc9131ec"
	const install = "0442411f-6b3c-42a2-b839-b553383c2be1"
	const fakeLead = "93d862a9-7d2a-4d91-ac54-8380de4c1f0f"
	var qualified crmEvent
	bus := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/integration/v1/crm/contacts.create":
			if r.Header.Get("X-Bia-Installation-ID") != install {
				t.Error("contact request did not include the installation")
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"leadId": fakeLead})
		case "/integration/v1/events":
			if err := json.NewDecoder(r.Body).Decode(&qualified); err != nil {
				t.Error(err)
			}
			w.WriteHeader(http.StatusAccepted)
		default:
			http.NotFound(w, r)
		}
	}))
	defer bus.Close()

	app, creds, contextQueue, executionQueue, now := pipelineApp(t)
	app.crmRoutes = map[string]crmRoute{"org_demo_alfa": {
		Origin: bus.URL, Organization: org, Installation: install,
		Token: "arkom_service_" + strings.Repeat("A", 43),
	}}
	live := os.Getenv("BIA_CRM_LIVE_ROUTES_FILE") != ""
	email := "teste@example.com"
	name := "Contato fictício"
	if live {
		t.Setenv("SDR_CRM_ROUTES_FILE", os.Getenv("BIA_CRM_LIVE_ROUTES_FILE"))
		t.Setenv("SDR_CRM_DEV_ENABLED", "true")
		if err := app.configureCRM(); err != nil {
			t.Fatal(err)
		}
		email = os.Getenv("BIA_CRM_LIVE_EMAIL")
		if email == "" {
			t.Fatal("an isolated Codehall test email is required")
		}
		name = "[DEV] CRMGO teste ponta a ponta"
		*now = time.Now().UTC()
	}
	route := app.crmRoutes["org_demo_alfa"]
	session := login(t, app, creds, "alfa.admin")
	code, result := req(app, "POST", "/v1/sdr/crm/contacts.create", session, "", map[string]string{"name": name, "email": email})
	lead, _ := result["leadId"].(string)
	if code != 201 || !crmUUID.MatchString(lead) || (!live && lead != fakeLead) {
		t.Fatalf("contact not linked: %d %v", code, result)
	}
	conversation := result["conversationId"].(string)
	code, result = req(app, "POST", "/__test/ui/inbound", session, "", map[string]any{
		"provider_event_id": "crm-test-event", "conversation_id": conversation,
		"text": "Somos a Empresa Horizonte. Queremos organizar oportunidades.",
	})
	if code != 202 {
		t.Fatalf("inbound failed: %d %v", code, result)
	}
	*now = now.Add(6 * time.Second)
	prepare(t, contextQueue)
	worker := executionworker.Worker{Queue: executionQueue, Planner: mockPlanner{Call: func(c sdrsdk.Prepared) sdrsdk.Outcome {
		return sdrsdk.Outcome{Model: "test-model", Decision: sdrsdk.Decision{
			Action: "reply", Message: "Entendi, vamos organizar as oportunidades.",
			Facts: []sdrsdk.ExtractedFact{
				{Key: "company", Value: "Empresa Horizonte", MessageID: c.InputIDs[0]},
				{Key: "goal", Value: "organizar oportunidades", MessageID: c.InputIDs[0]},
			},
		}}
	}}}
	if worked, err := worker.Once(context.Background()); !worked || err != nil {
		t.Fatalf("qualification worker: %t %v", worked, err)
	}
	if live {
		for _, event := range app.state.CRMOutbox {
			qualified = event
		}
	}
	app.flushCRM(context.Background(), bus.Client())
	if live {
		if event := app.state.CRMOutbox[qualified.ID]; qualified.ID == "" || event.Data != nil {
			t.Fatal("CRMGO did not acknowledge qualification")
		}
		if err := publishCRM(context.Background(), bus.Client(), route, qualified); err != nil {
			t.Fatalf("duplicate qualification was not accepted: %v", err)
		}
		t.Logf("CRMGO live result lead=%s conversation=%s event=%s", lead, conversation, qualified.ID)
	}

	if qualified.Subject != conversation || qualified.Data["clickmax_lead_id"] != lead ||
		qualified.Organization != route.Organization || qualified.Type != "bia-sdr.crm.opportunity-qualified.v1" {
		t.Fatalf("incorrect qualification event: %+v", qualified)
	}
}
