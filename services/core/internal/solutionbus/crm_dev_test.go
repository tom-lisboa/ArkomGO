package solutionbus

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"arkom/bia/internal/crmsync"
	"arkom/bia/internal/platformdirectory"
	contract "arkom/bia/pkg/solutionbus"
	sdk "clickmax.io/go"
	"github.com/jackc/pgx/v5/pgxpool"
)

type crmTestTransport func(*http.Request) (*http.Response, error)

func (f crmTestTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCRMDevelopmentRoute(t *testing.T) {
	dsn := os.Getenv("ARKOM_CRM_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires an empty disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	const (
		org           = "00000000-0000-4000-8000-000000000001"
		install       = "00000000-0000-4000-8000-000000000002"
		testworkspace = "00000000-0000-4000-8000-000000000003"
		testlead      = "00000000-0000-4000-8000-000000000004"
		testpipeline  = "00000000-0000-4000-8000-000000000005"
		teststage     = "00000000-0000-4000-8000-000000000006"
		card          = "00000000-0000-4000-8000-000000000007"
	)
	workspace, lead, pipeline, stage := testworkspace, testlead, testpipeline, teststage
	liveKeyFile := os.Getenv("ARKOM_CRM_CODEHALL_KEY_FILE")
	live := liveKeyFile != ""
	var liveClient *sdk.Client
	if live {
		workspace = "8b96d893-9580-458c-9eac-94e8844876d7"
		pipeline = "492a45cf-fcc2-4355-a6f8-1e5ec3f20e14"
		stage = "85ae70c0-dca4-4fe8-b68b-4b1e23813911"
		lead = os.Getenv("ARKOM_CRM_CODEHALL_TEST_LEAD")
		if lead == "" {
			t.Fatal("Codehall test contact required")
		}
		key, err := os.ReadFile(liveKeyFile)
		if err != nil {
			t.Fatal("could not read Codehall key")
		}
		t.Setenv("ARKOM_CRM_CLICKMAX_TEST", strings.TrimSpace(string(key)))
		liveClient, err = sdk.New(strings.TrimSpace(string(key)))
		if err != nil {
			t.Fatal(err)
		}
		who, err := liveClient.Whoami(ctx)
		if err != nil || who.Workspace.WorkspaceID != workspace {
			t.Fatal("credential is not scoped to Codehall")
		}
		contact, err := liveClient.Leads.Get(ctx, sdk.LeadsGetParams{LeadID: lead})
		if err != nil || contact == nil {
			t.Fatalf("Codehall test contact not readable: %v", err)
		}
	}

	_, err = db.Exec(ctx, "CREATE TABLE platform_organizations(id uuid PRIMARY KEY, enabled boolean);"+Schema+platformdirectory.Schema+crmsync.Schema)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO platform_organizations VALUES ('`+org+`',true);
		INSERT INTO platform_directory.customers(namespace,reference,name) VALUES ('dev','customer','CRM dev');
		INSERT INTO platform_directory.organizations(id,customer_id,namespace,reference)
			SELECT '`+org+`',id,'dev','org' FROM platform_directory.customers;
		INSERT INTO platform_directory.entitlements(organization_id,solution) VALUES ('`+org+`','bia-sdr');
		INSERT INTO platform_directory.backends VALUES ('bia-dev','bia-sdr');
		INSERT INTO platform_directory.backend_organizations VALUES ('bia-dev','bia-sdr','`+org+`','local-org');
		INSERT INTO platform_directory.installation_origins VALUES ('https://bia.example.test','`+org+`','dev');
		INSERT INTO platform_directory.installations(id,organization_id,backend,solution,origin,source_reference)
			VALUES ('`+install+`','`+org+`','bia-dev','bia-sdr','https://bia.example.test','dev');`)
	if err != nil {
		t.Fatal(err)
	}
	credential, err := Provision(ctx, db, "bia-sdr", org)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO arkom_crm.routes
		(organization_id,bia_installation_id,publisher_id,crm_reference,workspace_id,pipeline_id,stage_id,key_env,enabled)
		VALUES ($1,$2,$3,'crm-dev',$4,$5,$6,'ARKOM_CRM_CLICKMAX_TEST',true)`, org, install, credential.ClientID, workspace, pipeline, stage)
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	Server{DB: db}.Mount(mux)
	server := httptest.NewServer(mux)
	defer server.Close()
	if live {
		pilot := os.Getenv("ARKOM_CRM_BIA_DEV_DIR")
		if pilot == "" {
			t.Fatal("Bia dev source directory required")
		}
		cmd := exec.CommandContext(ctx, "go", "test", "-count=1", "-run", "^TestCRMQualificationDevSmoke$", ".")
		cmd.Dir = pilot
		cmd.Env = append(os.Environ(), "BIA_CRM_SMOKE_ORIGIN="+server.URL, "BIA_CRM_SMOKE_ORG="+org,
			"BIA_CRM_SMOKE_INSTALL="+install, "BIA_CRM_SMOKE_TOKEN="+credential.Token, "BIA_CRM_SMOKE_LEAD="+lead)
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("Bia qualification failed: %v: %s", err, output)
		}
	} else {
		bia := contract.Client{BaseURL: server.URL, Token: credential.Token, OrganizationID: org}
		event := contract.Event{ID: "crm-qualification-test", OrganizationID: org, Source: "bia-sdr",
			Type: crmsync.EventType, Subject: "crm-test", OccurredAt: time.Now().UTC(),
			Data: json.RawMessage(`{"bia_installation_id":"` + install + `","clickmax_lead_id":"` + lead + `","title":"Lead qualificado pela Bia"}`)}
		for range 2 {
			if err := bia.Publish(ctx, event); err != nil {
				t.Fatal(err)
			}
		}
		t.Setenv("ARKOM_CRM_CLICKMAX_TEST", "cxd_"+strings.Repeat("A", 43))
	}

	created := 0
	worker := crmsync.Worker{DB: db, BaseURL: "https://clickmax.example.test", Transport: crmTestTransport(func(r *http.Request) (*http.Response, error) {
		var body string
		switch r.Method + " " + r.URL.Path {
		case "GET /whoami":
			body = `{"workspace":{"workspaceId":"` + workspace + `"}}`
		case "POST /cards/create":
			var input struct {
				LeadIDs                    []string
				PipelineID, StageID, Title string
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil ||
				len(input.LeadIDs) != 1 || input.LeadIDs[0] != lead ||
				input.PipelineID != pipeline || input.StageID != stage || input.Title != "Lead qualificado pela Bia" {
				t.Errorf("incorrect CRM destination or payload: %+v", input)
			}
			created++
			body = `{"id":"` + card + `"}`
		default:
			t.Errorf("unexpected Clickmax request: %s %s", r.Method, r.URL.Path)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	if live {
		worker.Transport = nil
		worker.BaseURL = sdk.DefaultBaseURL
		worker.PublicDevWorkspace = workspace
	}

	if worked, err := worker.ProcessOne(ctx); err != nil || !worked {
		t.Fatalf("worker did not process the event: %v, %v", worked, err)
	}
	if worked, err := worker.ProcessOne(ctx); err != nil || worked || (!live && created != 1) {
		t.Fatalf("duplicate or failed delivery: %v, %v, %d creates", worked, err, created)
	}
	var state, storedCard string
	err = db.QueryRow(ctx, "SELECT state,clickmax_card_id::text FROM arkom_crm.deliveries").Scan(&state, &storedCard)
	if err != nil || state != "done" || (!live && storedCard != card) {
		t.Fatalf("card receipt was not persisted: %s, %s, %v", state, storedCard, err)
	}
	if live {
		got, err := liveClient.Cards.Get(ctx, sdk.CardsGetParams{CardID: storedCard})
		if err != nil || got.ID != storedCard || got.PipelineID != pipeline || got.StageID != stage {
			t.Fatalf("Codehall card verification failed for %s: %v", storedCard, err)
		}
		t.Logf("Verified Codehall card %s", storedCard)
	}

}
