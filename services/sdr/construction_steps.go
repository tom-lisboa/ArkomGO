package main

import (
	"context"
	"deeph/pkg/application"
	"deeph/pkg/arkom"
	"deeph/pkg/construction"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"sdr-next-pilot/pkg/sdrsdk"
	"time"
)

type constructionExecution struct {
	id     string
	cancel context.CancelFunc
}
type constructionSetup func() (construction.Provider, construction.Tester, error)
type constructionStepView struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Acceptance    string `json:"acceptance"`
	Status        string `json:"status"`
	FirstSequence int    `json:"first_sequence"`
	LastSequence  int    `json:"last_sequence"`
	TraceCount    int    `json:"trace_count"`
}

// Progress is a projection of committed evidence, never a client-side timer/counter.
func (b *ConstructionBuild) nextStepID() string {
	if !construction.SupportsSteps(b.StepsVersion) {
		return ""
	}
	steps := construction.StepsForVersion(b.StepsVersion)
	next := 0
	for _, e := range b.Traces {
		if next < len(steps) && (e.Kind == "step.completed" || e.Kind == "step.reused") && e.StepID == steps[next].ID {
			next++
		}
	}
	if next == len(steps) {
		return ""
	}
	return steps[next].ID
}
func (b *ConstructionBuild) steps() []constructionStepView {
	out := []constructionStepView{}
	if !construction.SupportsSteps(b.StepsVersion) {
		return out
	}
	for _, s := range construction.StepsForVersion(b.StepsVersion) {
		v := constructionStepView{ID: s.ID, Title: s.Title, Acceptance: s.Acceptance, Status: "pending"}
		if construction.IsSvelte(b.Files) {
			if s.ID == "interface" {
				v.Title = "Construir interface Svelte"
				v.Acceptance = "Componentes Svelte compilados; revisão final pendente."
			}
			if s.ID == "reviewer" {
				v.Acceptance = "Contrato válido, testes Go aprovados e Svelte compilado."
			}
		}
		for _, e := range b.Traces {
			if e.StepID != s.ID {
				continue
			}
			if v.FirstSequence == 0 {
				v.FirstSequence = e.Sequence
			}
			v.LastSequence = e.Sequence
			v.TraceCount++
			switch e.Kind {
			case "step.started":
				v.Status = "running"
			case "step.reused":
				v.Status = "reused"
			case "step.completed":
				v.Status = "completed"
			case "step.failed":
				v.Status = "failed"
			case "step.cancelled":
				v.Status = "cancelled"
			case "step.interrupted":
				v.Status = "interrupted"
			}
		}
		out = append(out, v)
	}
	return out
}
func (b *ConstructionBuild) appendStepEvent(kind, stepID, summary, output string, at time.Time) {
	b.UpdatedAt = at
	b.Traces = append(b.Traces, ConstructionTrace{construction.Event{Kind: kind, Agent: "system", StepID: stepID, ExecutionID: b.ExecutionID, Summary: summary, Output: output}, len(b.Traces) + 1, at})
}
func (a *App) prepareConstruction(stepID string) (construction.Provider, construction.Tester, error) {
	if a.constructionClosed {
		return nil, nil, errors.New("construction_unavailable")
	}
	if a.constructionSetup != nil {
		return a.constructionSetup()
	}
	if !construction.PlanningStep(stepID) && !(construction.Sandbox{}).Available() {
		return nil, nil, errors.New("isolated_runner_unavailable")
	}
	planner, err := sdrsdk.NewOpenAI(os.Getenv("OPENAI_API_KEY"), os.Getenv("SDR_OPENAI_MODEL"))
	if err != nil {
		return nil, nil, errors.New("genesis_unavailable")
	}
	return constructionProvider{planner}, construction.Sandbox{}, nil
}

// Called under a.mu after the start transaction commits.
func (a *App) launchConstruction(b *ConstructionBuild, provider construction.Provider, tester construction.Tester) {
	version, revisionScope := b.StepsVersion, b.RevisionScope
	id, executionID, stepID, goal := b.ID, b.ExecutionID, b.nextStepID(), b.Goal
	files := map[string]string{}
	for k, v := range b.Files {
		files[k] = v
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	if a.constructionRuns == nil {
		a.constructionRuns = map[string]constructionExecution{}
	}
	a.constructionRuns[id] = constructionExecution{executionID, cancel}
	go func() {
		defer cancel()
		defer func() {
			a.mu.Lock()
			defer a.mu.Unlock()
			if a.constructionRuns[id].id == executionID {
				delete(a.constructionRuns, id)
			}
		}()
		refs := map[string]string{"reference/catalog.json": arkom.Catalog, "reference/platform-contracts.go": construction.Contracts}
		for _, name := range []string{"sdr-types.go.txt", "crm-integration.md"} {
			data, _ := constructionReferences.ReadFile("demo/construction/reference/" + name)
			refs["reference/"+name] = string(data)
		}
		engine := construction.Engine{RevisionScope: revisionScope, StepsVersion: version, Provider: provider, Tester: tester, References: refs, Emit: func(e construction.Event) error { return a.constructionRunTrace(id, executionID, e) }}
		_, err := engine.RunStep(ctx, goal, files, stepID)
		a.finishConstructionStep(id, executionID, stepID, err, ctx.Err())
	}()
}
func (a *App) finishConstructionStep(id, executionID, stepID string, err, contextErr error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	b := a.state.Platform.Constructions[id]
	if a.constructionClosed || b == nil || b.Status != "running" || b.ExecutionID != executionID || b.nextStepID() != stepID {
		return
	}
	// A successful return is insufficient without the committed final engine receipt.
	if err == nil && contextErr == nil {
		if len(b.Traces) == 0 {
			err = errors.New("missing_step_completion_evidence")
		} else {
			receipt := b.Traces[len(b.Traces)-1]
			if receipt.Kind != "agent.finished" || receipt.Agent != stepID || receipt.StepID != stepID || receipt.ExecutionID != executionID {
				err = errors.New("missing_step_completion_evidence")
			}
		}
	}
	var contract *application.Contract
	if stepID == "reviewer" && err == nil && contextErr == nil {
		if !construction.FrontendCurrent(b.Files) {
			err = errors.New("frontend_build_stale")
		} else {
			contract, err = application.Seal(b.ApplicationID, b.Revision, b.Files)
		}
	}
	if saveErr := a.transact(func() {
		b.Contract = contract
		b.Status = "awaiting_step"
		kind, summary := "step.completed", "Etapa validada. Revise os traces antes de iniciar a próxima."
		evidence, _ := json.Marshal(map[string]any{"source_digest": application.Digest(b.Files), "files_count": len(b.Files), "acceptance": b.steps()[construction.StepIndexForVersion(b.StepsVersion, stepID)].Acceptance})
		if err != nil {
			b.Status = "failed"
			kind = "step.failed"
			summary = "A etapa precisa de correção. Consulte os traces e retome a mesma etapa."
			evidence = nil
		}
		if contextErr != nil {
			b.Status = "cancelled"
			kind = "step.cancelled"
			summary = "Etapa interrompida; arquivos preservados."
			evidence = nil
		}
		if err == nil && contextErr == nil && stepID == "reviewer" {
			b.Status = "ready"
			summary = "Entrega validada: contrato final e testes Go aprovados."
			if construction.IsSvelte(b.Files) {
				summary = "Entrega validada: contrato, testes Go e compilação Svelte aprovados. Inspeção visual pendente."
			}
		}
		b.appendStepEvent(kind, stepID, summary, string(evidence), a.now().UTC())
		a.record(AuditEntry{Org: b.Org, Actor: "deeph", Action: "construction." + kind, Operation: id})
	}); saveErr != nil {
		log.Print("construction step checkpoint could not be persisted")
		return
	}
	a.signalConstruction()
}

// Called under a.mu. Clients provide the exact checkpoint they reviewed.
func (a *App) advanceConstruction(w http.ResponseWriter, r *http.Request, u User, b *ConstructionBuild) {
	if u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return
	}
	var body struct {
		StepID   string `json:"step_id"`
		Sequence int    `json:"sequence"`
	}
	if !decodeCore(w, r, &body) {
		return
	}
	if !construction.SupportsSteps(b.StepsVersion) || b.nextStepID() == "" || (b.Status != "awaiting_step" && b.Status != "failed" && b.Status != "cancelled" && b.Status != "interrupted") {
		fail(w, 409, "step_not_available")
		return
	}
	if body.StepID != b.nextStepID() || body.Sequence != len(b.Traces) {
		fail(w, 409, "step_checkpoint_changed")
		return
	}
	for _, other := range a.state.Platform.Constructions {
		if other.Status == "running" {
			fail(w, 409, "construction_busy")
			return
		}
	}
	provider, tester, err := a.prepareConstruction(body.StepID)
	if err != nil {
		fail(w, 503, err.Error())
		return
	}
	if a.transact(func() {
		b.ExecutionID = token()
		b.Status = "running"
		b.Contract = nil
		b.appendStepEvent("step.started", body.StepID, "Etapa iniciada pelo cliente a partir do checkpoint salvo.", "", a.now().UTC())
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "construction.step_started", Operation: b.ID})
	}) != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	a.signalConstruction()
	a.launchConstruction(b, provider, tester)
	write(w, 202, b.summary())
}
