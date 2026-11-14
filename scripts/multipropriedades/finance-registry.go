package financebridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"arkom/multipropriedades/internal/supabase"
)

// Registry is loaded only by the ArkomGO homologation launcher. The embedded
// Bridge continues to validate evidence and run the original Maia commands.
type registryEntry struct {
	*Bridge
	TitleToken string
}

type Registry struct {
	seeds                     map[string]registryEntry
	dir, address, supabaseURL string
	writes                    bool
}

var signupUUID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

func OpenRegistry(ctx context.Context, file, address, supabaseURL string, writes bool) (*Registry, error) {
	if file == "" {
		return nil, nil
	}
	info, err := os.Lstat(file)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 4096 {
		return nil, errors.New("vínculos de homologação da Maia indisponíveis")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return nil, errors.New("vínculos de homologação da Maia indisponíveis")
	}
	var entries map[string]struct {
		File       string `json:"file"`
		TitleToken string `json:"title_token"`
	}
	if json.Unmarshal(raw, &entries) != nil || len(entries) != 2 {
		return nil, errors.New("cada empresa da Maia exige seu próprio vínculo")
	}
	registry := &Registry{seeds: make(map[string]registryEntry, len(entries)), dir: filepath.Join(filepath.Dir(file), "onboarded"), address: address, supabaseURL: supabaseURL, writes: writes}
	for org, entry := range entries {
		if filepath.Dir(entry.File) != filepath.Dir(file) || !ValidID(entry.TitleToken) || len(entry.TitleToken) < 32 {
			registry.Close()
			return nil, errors.New("configuração de homologação da Maia inválida")
		}
		bridge, err := Open(ctx, entry.File, address, supabaseURL, writes)
		if err != nil {
			registry.Close()
			return nil, err
		}
		valid := bridge.MultiOrg == org && bridge.Token != entry.TitleToken
		for _, prior := range registry.seeds {
			valid = valid && bridge.FinanceOrg != prior.FinanceOrg && bridge.Account != prior.Account &&
				bridge.Subject != prior.Subject && bridge.Database != prior.Database &&
				bridge.Token != prior.Token && bridge.Token != prior.TitleToken &&
				entry.TitleToken != prior.Token && entry.TitleToken != prior.TitleToken
		}
		if !valid {
			bridge.Close()
			registry.Close()
			return nil, errors.New("vínculos da Maia não isolam as duas empresas")
		}
		registry.seeds[org] = registryEntry{bridge, entry.TitleToken}
	}
	return registry, nil
}

// Newly registered tenants use a separate scoped SQL login. Open only the
// requested owner's binding so an invalid new file cannot block other tenants.
func (r *Registry) entry(ctx context.Context, org string) (registryEntry, func(), error) {
	if entry, ok := r.seeds[org]; ok {
		return entry, func() {}, nil
	}
	if !signupUUID.MatchString(org) {
		return registryEntry{}, nil, supabase.ErrForbidden
	}
	path := filepath.Join(r.dir, org)
	info, err := os.Lstat(path + ".title")
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 240 {
		return registryEntry{}, nil, supabase.ErrForbidden
	}
	raw, err := os.ReadFile(path + ".title")
	token := string(raw)
	if err != nil || !ValidID(token) || len(token) < 32 {
		return registryEntry{}, nil, supabase.ErrUnavailable
	}
	bridge, err := Open(ctx, path+".json", r.address, r.supabaseURL, r.writes)
	if err != nil {
		return registryEntry{}, nil, supabase.ErrUnavailable
	}
	if bridge.MultiOrg != org || bridge.Token == token {
		bridge.Close()
		return registryEntry{}, nil, supabase.ErrForbidden
	}
	return registryEntry{bridge, token}, bridge.Close, nil
}

func (r *Registry) Close() {
	for _, entry := range r.seeds {
		entry.Close()
	}
}

func (r *Registry) Link(ctx context.Context, org, actor, parcel, title string, version time.Time) (json.RawMessage, error) {
	entry, close, err := r.entry(ctx, org)
	if err != nil {
		return nil, err
	}
	defer close()
	return entry.Link(ctx, org, actor, parcel, title, version)
}

func (r *Registry) Apply(ctx context.Context, org, actor, parcel, reconciliation string) (json.RawMessage, error) {
	entry, close, err := r.entry(ctx, org)
	if err != nil {
		return nil, err
	}
	defer close()
	return entry.Apply(ctx, org, actor, parcel, reconciliation)
}

func (r *Registry) Reverse(ctx context.Context, org, actor, parcel, reconciliation string) (json.RawMessage, error) {
	entry, close, err := r.entry(ctx, org)
	if err != nil {
		return nil, err
	}
	defer close()
	return entry.Reverse(ctx, org, actor, parcel, reconciliation)
}

type installment struct {
	Value          string    `json:"valor"`
	DueDate        string    `json:"vencimento"`
	Today          string    `json:"hoje"`
	UpdatedAt      time.Time `json:"atualizada_em"`
	Description    string    `json:"descricao"`
	Status         string    `json:"situacao"`
	Title          string    `json:"titulo_id"`
	Reconciliation string    `json:"conciliacao_id"`
	Linkable       bool      `json:"vinculavel"`
}

func (b *Bridge) installment(ctx context.Context, org, actor, parcel string) (installment, error) {
	var p installment
	raw, err := b.result(ctx, "select app_multi._arkom_financeai_status($1,$2,$3,$4,$5,$6)",
		org, actor, parcel, b.FinanceOrg, b.Account, b.Subject)
	if err != nil {
		return p, err
	}
	if err := b.verifyIdentity(ctx, org); err != nil {
		return p, err
	}
	if json.Unmarshal(raw, &p) != nil {
		return p, supabase.ErrUnavailable
	}
	return p, nil
}

type financeStatus struct {
	State string `json:"estado"`
	ID    string `json:"conciliacao_id,omitempty"`
	Title string `json:"titulo_id,omitempty"`
}

func (r *Registry) Status(ctx context.Context, org, actor, parcel string) (financeStatus, error) {
	entry, close, err := r.entry(ctx, org)
	if err != nil {
		return financeStatus{}, err
	}
	defer close()
	p, err := entry.installment(ctx, org, actor, parcel)
	if err != nil {
		return financeStatus{}, err
	}
	if p.Title == "" {
		if p.Linkable {
			return financeStatus{State: "sem_titulo"}, nil
		}
		return financeStatus{State: "indisponivel"}, nil
	}
	if !ValidID(p.Title) {
		return financeStatus{}, supabase.ErrUnavailable
	}
	status := financeStatus{Title: p.Title}
	id := p.Reconciliation
	if id == "" {
		// Only settlements can enable a new baixa. An earlier reversal stays
		// in FinanceAI history, even after Maia has cleared the active link.
		var events struct {
			Data []struct {
				Kind             string
				ReconciliationID string
			}
		}
		if err := entry.get(ctx, "/v1/finance/titles/"+p.Title+"/events", &events); err != nil {
			return financeStatus{}, err
		}
		for _, event := range events.Data {
			if event.ReconciliationID != "" && (event.Kind == "settlement" || event.Kind == "reversal" || event.Kind == "source_invalidated") {
				id = event.ReconciliationID
				break
			}
		}
	}
	if id == "" {
		status.State = "aguardando"
		return status, nil
	}
	if !ValidID(id) {
		return financeStatus{}, supabase.ErrUnavailable
	}
	var evidence reconciliationEvidence
	if err := entry.get(ctx, "/v1/finance/reconciliations/"+id, &evidence); err != nil {
		return financeStatus{}, err
	}
	if evidence.ID != id || evidence.TitleID != p.Title || evidence.TitleReference != reference(parcel) ||
		evidence.AccountID != entry.Account || evidence.SubjectID != entry.Subject {
		return financeStatus{}, supabase.ErrUnavailable
	}
	future := !evidence.BankDate.IsZero() && evidence.BankDate.In(entry.zone).Format(time.DateOnly) > p.Today
	switch {
	case future && evidence.State == "confirmed" && p.Reconciliation == "" && p.Status == "aberta":
		status.State = "data_futura"
	case evidence.State == "confirmed" && p.Reconciliation == "" && p.Status == "aberta":
		status.State, status.ID = "baixa_disponivel", id
	case evidence.State == "reversed" && p.Reconciliation == id && p.Status == "paga":
		status.State, status.ID = "estorno_disponivel", id
	case evidence.State == "confirmed" && p.Reconciliation == id && p.Status == "paga":
		status.State = "baixada"
	case evidence.State == "review_required" || evidence.State == "invalidated":
		status.State = "em_revisao"
	default:
		status.State = "aguardando"
	}
	return status, nil
}

func (r *Registry) Prepare(ctx context.Context, org, actor, parcel string) (json.RawMessage, error) {
	entry, close, err := r.entry(ctx, org)
	if err != nil {
		return nil, err
	}
	defer close()
	p, err := entry.installment(ctx, org, actor, parcel)
	if err != nil {
		return nil, err
	}
	if p.Title != "" {
		return json.RawMessage(`{"status":"vinculada"}`), nil
	}
	if !p.Linkable {
		return nil, supabase.ErrConflict
	}
	description := p.Description
	if description == "" {
		description = "Parcela de contrato"
	}
	body, _ := json.Marshal(map[string]string{
		"accountId": entry.Account, "kind": "receivable", "reference": reference(parcel),
		"description": "Maia · " + description, "amount": p.Value, "currency": "BRL", "dueDate": p.DueDate,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, entry.URL+"/v1/finance/titles", bytes.NewReader(body))
	if err != nil {
		return nil, supabase.ErrUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+entry.TitleToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "maia-v1-"+parcel)
	res, err := entry.http.Do(req)
	if err != nil {
		return nil, supabase.ErrUnavailable
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusConflict {
		return nil, supabase.ErrConflict
	}
	var title struct{ ID string }
	if res.StatusCode != http.StatusCreated ||
		json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&title) != nil || !ValidID(title.ID) {
		return nil, supabase.ErrUnavailable
	}
	return entry.Link(ctx, org, actor, parcel, title.ID, p.UpdatedAt)
}
