package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strings"
	"time"

	"sdr-next-pilot/pkg/sdrsdk"
)

const signupEnvironment = "registered-homolog"
const passwordIterations = 600000

var registeredCompany = regexp.MustCompile(`^h-[a-f0-9]{32}$`)
var registeredOrganization = regexp.MustCompile(`^org_h-[a-f0-9]{32}$`)

type platformAccount struct {
	Email       string    `json:"email"`
	User        User      `json:"user"`
	Company     string    `json:"company"`
	Description string    `json:"description"`
	Timezone    string    `json:"timezone"`
	Salt        []byte    `json:"salt"`
	Password    []byte    `json:"password_hash"`
	CreatedAt   time.Time `json:"created_at"`
	RetryAt     time.Time `json:"retry_at,omitempty"`
	Attempts    int       `json:"attempts,omitempty"`
	Ready       bool      `json:"ready"`
}

type signupDetails struct {
	Company     string `json:"company"`
	Org         string `json:"organization_id"`
	Actor       string `json:"user_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

func platformSignupEnabled() bool {
	return platformRequiresLogin() && os.Getenv("ARKOM_LOCAL_DEMO") == "true" &&
		os.Getenv("SDR_CRM_DEV_ENABLED") == "true" && os.Getenv("ARKOM_SIGNUP_PROVISIONER") != ""
}

func (a *App) platformSignupHTTP(w http.ResponseWriter, r *http.Request) bool {
	if r.URL.Path != "/v1/platform/auth/signup" && r.URL.Path != "/v1/platform/auth/options" {
		return false
	}
	if remoteIP(r) != "127.0.0.1" || !platformRequiresLogin() || os.Getenv("ARKOM_LOCAL_DEMO") != "true" {
		fail(w, 404, "not_found")
		return true
	}
	if r.Method == http.MethodGet && r.URL.Path == "/v1/platform/auth/options" {
		write(w, 200, map[string]bool{"signup": platformSignupEnabled()})
		return true
	}
	if r.Method != http.MethodPost || r.URL.Path != "/v1/platform/auth/signup" || !platformSignupEnabled() {
		fail(w, 404, "not_found")
		return true
	}
	a.signupPlatformAccount(w, r)
	return true
}

func derivePlatformPassword(password string, salt []byte) []byte {
	digest, _ := pbkdf2.Key(sha256.New, password, salt, passwordIterations, 32)
	return digest
}

func (a *App) signupPlatformAccount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		Company     string `json:"company"`
		Description string `json:"description"`
		Timezone    string `json:"timezone"`
	}
	if !decodeCore(w, r, &input) {
		return
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Company = strings.TrimSpace(input.Company)
	input.Description = strings.TrimSpace(input.Description)
	addr, err := mail.ParseAddress(input.Email)
	_, zoneErr := time.LoadLocation(input.Timezone)
	if err != nil || addr.Address != input.Email || !textOK(input.Email, 254, true) ||
		len(input.Password) < 12 || len(input.Password) > 256 || !textOK(input.Company, 100, true) ||
		!textOK(input.Description, 1000, true) || len(input.Description) < 12 || zoneErr != nil ||
		input.Timezone == "" || input.Timezone == "Local" || len(input.Timezone) > 64 {
		fail(w, 422, "invalid_signup")
		return
	}
	if input.Email == "alfa@arkom.test" || input.Email == "beta@arkom.test" {
		fail(w, 409, "account_exists")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	// The API sees the loopback proxy. Apply a shared intake limit and a
	// bounded queue while maintaining strict per-account login limits.
	if !a.allow(w, r, []quota{{"platform-signup", 30, 15 * time.Minute}}) {
		return
	}
	if _, exists := a.state.Signups[input.Email]; exists {
		fail(w, 409, "account_exists")
		return
	}
	pending := 0
	for _, account := range a.state.Signups {
		if !account.Ready && account.Attempts < 12 {
			pending++
		}
	}
	if pending >= 30 {
		fail(w, 503, "signup_busy")
		return
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	company := "h-" + token()[:32]
	account := platformAccount{
		Email: input.Email, Company: input.Company, Description: input.Description,
		Timezone: input.Timezone, Salt: salt, Password: derivePlatformPassword(input.Password, salt),
		User:      User{ID: "user_" + company, Org: "org_" + company, Role: "admin", Environment: signupEnvironment},
		CreatedAt: a.now().UTC(),
	}
	if err := a.transact(func() {
		if a.state.Signups == nil {
			a.state.Signups = make(map[string]platformAccount)
		}
		a.state.Signups[account.Email] = account
		a.record(AuditEntry{Org: account.User.Org, Actor: account.User.ID, Action: "platform.signup.requested"})
	}); err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, http.StatusAccepted, map[string]string{"status": "preparing"})
}

func (a *App) loginRegisteredPlatformUser(w http.ResponseWriter, r *http.Request, email, password string) {
	account, exists := a.state.Signups[email]
	sum := sha256.Sum256([]byte(email))
	if !a.allow(w, r, []quota{{"platform-user:" + hex.EncodeToString(sum[:]), 15, time.Minute}}) {
		return
	}
	if !exists || len(password) > 256 ||
		subtle.ConstantTimeCompare(derivePlatformPassword(password, account.Salt), account.Password) != 1 {
		fail(w, 401, "unauthorized")
		return
	}
	if !account.Ready {
		if account.Attempts >= 12 {
			fail(w, 503, "signup_needs_attention")
			return
		}
		write(w, http.StatusAccepted, map[string]string{"status": "preparing"})
		return
	}
	a.finishPlatformLogin(w, r, account.User)
}

func registeredFinanceCompany(u User) string {
	key := strings.TrimPrefix(u.Org, "org_")
	if u.Environment == signupEnvironment && u.Role == "admin" && registeredCompany.MatchString(key) &&
		u.ID == "user_"+key {
		return key
	}
	return ""
}

func (a *App) runPlatformSignups(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.provisionPlatformSignup(ctx)
		}
	}
}

func (a *App) provisionPlatformSignup(ctx context.Context) {
	a.mu.Lock()
	var job platformAccount
	for _, account := range a.state.Signups {
		if !account.Ready && account.Attempts < 12 && !a.now().Before(account.RetryAt) &&
			(job.Email == "" || account.CreatedAt.Before(job.CreatedAt)) {
			job = account
		}
	}
	a.mu.Unlock()
	if job.Email == "" {
		return
	}

	err := a.prepareSignupProducts(ctx, job)
	a.mu.Lock()
	defer a.mu.Unlock()
	if err != nil {
		log.Printf("signup provisioning retry %s: %v", job.User.Org, err)
		job.Attempts++
		job.RetryAt = a.now().Add(time.Duration(min(job.Attempts*10, 90)) * time.Second)
	} else {
		job.Ready = true
	}
	if saveErr := a.transact(func() {
		a.state.Signups[job.Email] = job
		if job.Ready {
			a.seedRegisteredWorkspace(job)
			a.record(AuditEntry{Org: job.User.Org, Actor: job.User.ID, Action: "platform.signup.ready"})
		}
	}); saveErr != nil {
		log.Print("signup storage unavailable")
	}
}

func (a *App) prepareSignupProducts(ctx context.Context, job platformAccount) error {
	ctx, cancel := context.WithTimeout(ctx, 95*time.Second)
	defer cancel()
	key := registeredFinanceCompany(job.User)
	if key == "" {
		return errors.New("invalid signup identity")
	}
	body, err := json.Marshal(signupDetails{Company: key, Org: job.User.Org, Actor: job.User.ID,
		Name: job.Company, Description: job.Description})
	if err != nil {
		return errors.New("invalid signup details")
	}
	command := exec.CommandContext(ctx, os.Getenv("ARKOM_SIGNUP_PROVISIONER"))
	command.Stdin = strings.NewReader(string(body))
	// The provisioner writes only a stable stage name on failure.
	out, err := command.Output()
	if err != nil {
		stage := strings.TrimSpace(string(out))
		switch stage {
		case "finance", "maia", "bridge", "bindings", "configuration":
			return errors.New(stage + " unavailable")
		default:
			return errors.New("provisioner unavailable")
		}
	}
	if a.wa != nil {
		if err := a.wa.Ensure(ctx, job.User.Org); err != nil {
			return errors.New("whatsapp unavailable")
		}
	}
	return a.prepareWhatsApp(job.User.Org)
}

func (a *App) seedRegisteredWorkspace(account platformAccount) {
	org, actor, name := account.User.Org, account.User.ID, account.Company
	now := a.now().UTC()
	profile := BusinessProfile{
		Name: name, Description: account.Description, Timezone: account.Timezone,
		Audience: "A definir pela empresa", Region: "A definir pela empresa", Tone: "Claro e profissional",
		EnabledSolutions: slices.Clone(coreSolutions),
		Sources: []BusinessSource{{ID: "cadastro", Title: "Descrição da empresa", Content: account.Description,
			Status: "approved", Solutions: []string{"all"}}},
		Facts: []BusinessFact{{ID: "atividade", Topic: "O que a empresa faz", Value: account.Description,
			SourceID: "cadastro", Solutions: []string{"all"}}},
	}
	a.state.Business[org] = &BusinessWorkspace{Revision: 1, Draft: cloneProfile(profile),
		Versions: []BusinessVersion{{Version: 1, Profile: cloneProfile(profile), Fingerprint: fingerprint(profile),
			PublishedAt: now, PublishedBy: actor, Reason: "Contexto informado no cadastro"}}, UpdatedAt: now}

	crm := &homologCRM{Pipelines: make(map[string]homologPipeline), Contacts: make(map[string]homologContact), Cards: make(map[string]homologCard)}
	pipeline := homologPipeline{ID: token(), Name: "Vendas da empresa", Description: "Funil inicial da " + name}
	for index, stage := range []string{"Novo contato", "Em atendimento", "Proposta"} {
		pipeline.Stages = append(pipeline.Stages, homologStage{token(), stage, index})
	}
	crm.Pipelines[pipeline.ID] = pipeline
	crm.DefaultPipeline = pipeline.ID
	if a.state.HomologCRMs == nil {
		a.state.HomologCRMs = make(map[string]*homologCRM)
	}
	a.state.HomologCRMs[org] = crm

	config := examplePlatform("")
	// The new company starts without fictional offers.
	config.Workflows = config.Workflows[1:]
	a.state.Platform.Workspaces[org] = &PlatformWorkspace{Revision: 1, Draft: clonePlatform(config),
		Versions: []PlatformVersion{{Version: 1, Config: clonePlatform(config), PublishedAt: now, PublishedBy: actor,
			Reason: "Fluxos iniciais da empresa"}}, UpdatedAt: now}
	calendar := sdrsdk.CalendarRef{ID: token(), Name: "Agenda da empresa", Provider: "native", Writable: true,
		Policy: sdrsdk.CalendarPolicy{Timezone: account.Timezone, Durations: []int{30}, Step: 30, Horizon: 60,
			Notice: 60, Approval: true}}
	for day := 1; day <= 5; day++ {
		calendar.Policy.Windows = append(calendar.Policy.Windows, sdrsdk.CalendarWindow{Day: day, Start: 9 * 60, End: 18 * 60})
	}
	a.state.Calendars.Calendars[calendar.ID] = &ManagedCalendar{Organization: org, Revision: 1, Enabled: true,
		Agents:      map[string]sdrsdk.CalendarGrant{"sdr": {Read: true, Book: true, Reschedule: true, Cancel: true}},
		CalendarRef: calendar}
	a.state.Transport.Policies[org] = transportPolicy{Revision: 1, Epoch: token(), Since: now, Allowed: []string{}}
}
