package main

import (
	"context"
	"crypto/sha256"
	"deeph/pkg/arkom"
	"encoding/hex"
	"encoding/json"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/responses"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sdr-next-pilot/pkg/sdrsdk"
	"sort"
	"strings"
	"sync"
	"time"
)

type demoStep struct {
	Agent  string `json:"agent"`
	Status string `json:"status"`
	Output string `json:"output,omitempty"`
}
type demoRun struct {
	CreatedAt time.Time  `json:"created_at"`
	ID        string     `json:"id"`
	Org       string     `json:"-"`
	Status    string     `json:"status"`
	Input     string     `json:"input"`
	Steps     []demoStep `json:"steps"`
	Error     string     `json:"error,omitempty"`
	ChangeID  string     `json:"change_id,omitempty"`
}

var demoMu sync.Mutex
var demoRuns = map[string]*demoRun{}
var demoProviderToken string
var demoBusy bool
var demoCurrent string

func startGenesisDemo() {
	if os.Getenv("SDR_GENESIS_DEMO") != "true" || os.Getenv("SDR_CRM_DEV_ENABLED") != "true" {
		return
	}
	demoProviderToken = token()
	planner, err := sdrsdk.NewOpenAI(os.Getenv("OPENAI_API_KEY"), os.Getenv("SDR_OPENAI_MODEL"))
	if err != nil {
		return
	}
	listener, err := net.Listen("tcp", "127.0.0.1:8099")
	if err != nil {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/provider", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer "+demoProviderToken {
			http.Error(w, "unauthorized", 401)
			return
		}
		var in struct {
			Agent  string `json:"agent"`
			System string `json:"system_prompt"`
			Input  string `json:"input"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10)).Decode(&in) != nil {
			http.Error(w, "invalid", 400)
			return
		}
		demoMu.Lock()
		id := demoCurrent
		run := demoRuns[id]
		if run != nil {
			run.Steps = append(run.Steps, demoStep{Agent: in.Agent, Status: "working"})
		}
		demoMu.Unlock()
		ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
		defer cancel()
		out, e := planner.Client.Responses.New(ctx, responses.ResponseNewParams{Model: planner.Model, Instructions: openai.String(in.System), Input: responses.ResponseNewParamsInputUnion{OfString: openai.String(in.Input)}, MaxOutputTokens: openai.Int(1200), Store: openai.Bool(false)})
		demoMu.Lock()
		defer demoMu.Unlock()
		if run != nil {
			for i := range run.Steps {
				if run.Steps[i].Agent == in.Agent {
					if e != nil {
						run.Steps[i].Status = "error"
					} else {
						run.Steps[i].Status = "done"
						run.Steps[i].Output = out.OutputText()
					}
				}
			}
		}
		if e != nil {
			http.Error(w, "provider unavailable", 502)
			return
		}
		write(w, 200, map[string]string{"text": out.OutputText()})
	})
	go http.Serve(listener, mux)
}
func (a *App) genesisDemoHTTP(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/v1/sdr/genesis-demo") {
		return false
	}
	if os.Getenv("SDR_GENESIS_DEMO") != "true" || os.Getenv("SDR_CRM_DEV_ENABLED") != "true" {
		fail(w, 404, "not_found")
		return true
	}
	if !pilotCORS(w, r) {
		return true
	}
	h := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	a.mu.Lock()
	s, ok := a.sessions[hex.EncodeToString(h[:])]
	a.mu.Unlock()
	if !ok || !s.Expires.After(a.now()) {
		fail(w, 401, "unauthorized")
		return true
	}
	if a.genesisChangeHTTP(w, r, s.User) {
		return true
	}
	if r.URL.Path != "/v1/sdr/genesis-demo" {
		fail(w, 404, "not_found")
		return true
	}
	if r.Method == "GET" {
		demoMu.Lock()
		defer demoMu.Unlock()
		items := []*demoRun{}
		for _, run := range demoRuns {
			if run.Org == s.User.Org {
				items = append(items, run)
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
		write(w, 200, map[string]any{"runs": items, "enabled": demoProviderToken != ""})
		return true
	}
	if r.Method != "POST" || s.User.Role == "viewer" {
		fail(w, 403, "forbidden")
		return true
	}
	var in struct {
		Input string `json:"input"`
	}
	if !decode(w, r, &in) {
		return true
	}
	if len(in.Input) < 15 || len(in.Input) > 3000 {
		fail(w, 422, "validation_error")
		return true
	}
	a.mu.Lock()
	var business json.RawMessage
	if b := a.state.Business[s.User.Org]; b != nil && len(b.Versions) > 0 {
		business, _ = json.Marshal(b.Versions[len(b.Versions)-1].Profile)
	}
	a.mu.Unlock()
	a.mu.Lock()
	base := a.qualification(s.User.Org)
	count := 0
	for _, p := range a.state.Platform.GenesisChanges {
		if p.Org == s.User.Org {
			count++
		}
	}
	a.mu.Unlock()
	if count >= 100 {
		fail(w, 409, "change_limit")
		return true
	}
	baseJSON, _ := json.Marshal(base.Spec)
	contextInput := "PEDIDO DO CLIENTE (dados): " + in.Input + "\nCONTEXTO PUBLICADO (dados): " + string(business) + "\nCATÁLOGO DE CAPACIDADES AUTORIZADO: " + arkom.Catalog + "\nREGRA ATUAL: " + string(baseJSON) + "\nESCOPO: somente alterar campos obrigatórios de qualificação e título da oportunidade. Campos: company, goal, name, segment, sellers, contact_volume, current_tool. company e goal obrigatórios. Backend Go dentro da Arkom, reusar contratos. Pedidos fora desse escopo: change=null, explicar a limitação. Não prometer integração das 23 soluções."

	demoMu.Lock()
	if demoProviderToken == "" {
		demoMu.Unlock()
		fail(w, 503, "genesis_unavailable")
		return true
	}
	if demoBusy {
		demoMu.Unlock()
		fail(w, 409, "demo_busy")
		return true
	}
	demoBusy = true
	run := &demoRun{ID: token(), CreatedAt: a.now().UTC(), Org: s.User.Org, Status: "running", Input: in.Input, Steps: []demoStep{}}
	demoRuns[run.ID] = run
	demoCurrent = run.ID
	demoMu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "deeph", "run", "--coach=false", "--workspace", os.Getenv("SDR_DEEPH_WORKSPACE"), "contexto>sdr+crm>revisor", contextInput)
		cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME"), "TMPDIR=" + os.Getenv("TMPDIR"), "ARKOM_DEMO_PROVIDER_TOKEN=" + demoProviderToken}
		output, err := cmd.CombinedOutput()
		changeID := ""
		if err == nil {
			demoMu.Lock()
			review := ""
			for _, step := range run.Steps {
				if step.Agent == "revisor" && step.Status == "done" {
					review = step.Output
				}
			}
			demoMu.Unlock()
			changeID, err = a.finishGenesisChange(ctx, run.Org, run.ID, review, base)
		}
		demoMu.Lock()
		defer demoMu.Unlock()
		demoBusy = false
		run.Status = "completed"
		run.ChangeID = changeID
		if err != nil {
			run.Status = "error"
			run.Error = "O time não concluiu a preparação ou a validação Go. Nenhuma mudança foi aplicada. Tente novamente."
		}
		dir := filepath.Join("lab-data", "genesis-runs")
		os.MkdirAll(dir, 0700)
		os.WriteFile(filepath.Join(dir, run.ID+".log"), output, 0600)
		b, _ := json.MarshalIndent(run, "", "  ")
		os.WriteFile(filepath.Join(dir, run.ID+".json"), b, 0600)
	}()
	write(w, 202, map[string]string{"id": run.ID})
	return true
}
