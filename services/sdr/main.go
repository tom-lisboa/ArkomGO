// Independent pilot. Its data and WhatsApp engine are separate from the existing SDR.
package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sdr-next-pilot/pkg/sdrsdk"
	"sort"
	"strings"
	"sync"
	"time"
)

type Conversation struct {
	Label        string     `json:"label,omitempty"`
	ID           string     `json:"id"`
	Contact      string     `json:"contact_id"`
	Org          string     `json:"organization_id"`
	Channel      string     `json:"channel"`
	Automation   string     `json:"automation"`
	OptedOut     bool       `json:"opted_out"`
	Revision     int        `json:"revision"`
	Updated      time.Time  `json:"updated_at"`
	InputVersion int        `json:"input_version,omitempty"`
	ResumedAt    *time.Time `json:"automation_resumed_at,omitempty"`
}
type Message struct {
	ID              string        `json:"id"`
	Conversation    string        `json:"conversation_id"`
	Sequence        int           `json:"sequence"`
	Direction       string        `json:"direction"`
	Author          string        `json:"author"`
	Text            string        `json:"text"`
	Status          string        `json:"status"`
	Created         time.Time     `json:"created_at"`
	BusinessVersion int           `json:"business_version,omitempty"`
	AIGenerated     bool          `json:"ai_generated,omitempty"`
	Media           *MessageMedia `json:"media,omitempty"`
	ExecutionID     string        `json:"execution_id,omitempty"`
	ExecutionStep   string        `json:"execution_step,omitempty"`
}
type Event struct {
	ID           string    `json:"id"`
	Cursor       string    `json:"cursor"`
	Kind         string    `json:"kind"`
	Conversation string    `json:"conversation_id"`
	Resource     string    `json:"resource_id"`
	At           time.Time `json:"at"`
}
type User struct {
	ID          string              `json:"user_id"`
	Org         string              `json:"organization_id"`
	Role        string              `json:"role"`
	Environment string              `json:"environment"`
	Platform    *directoryPrincipal `json:"platform,omitempty"`
}
type session struct {
	User    User
	Expires time.Time
}
type result struct {
	Fingerprint string
	Body        json.RawMessage
	Code        int
}
type Task struct {
	Conversation string
	Message      string
	Org          string
	Generation   int
	Automatic    bool
	RunID        string
}
type State struct {
	CRMContacts     map[string]map[string]string `json:",omitempty"`
	CRMOutbox       map[string]crmEvent          `json:",omitempty"`
	Voice           voiceState
	Calendars       CalendarState
	CustomerExports map[string]*CustomerExport
	Conversations   map[string]*Conversation
	Messages        map[string][]Message
	Events          map[string][]Event
	Results         map[string]result
	Tasks           []Task
	Generation      map[string]int
	Audit           []AuditEntry
	Busy            map[string]bool
	Business        map[string]*BusinessWorkspace
	ContextReceipts map[string]ContextReceipt
	Pipeline        PipelineState
	Platform        PlatformState
	Media           MediaState
	Transport       TransportState
}
type cursor struct {
	Org           string
	Scope         string
	At            time.Time
	Position      int
	Conversations []Conversation
	Messages      []Message
}
type App struct {
	constructionRuns    map[string]constructionExecution
	constructionSetup   constructionSetup
	constructionClosed  bool
	runtimeMu           sync.Mutex
	runtimes            map[string]*previewRuntime
	runtimeClosed       bool
	runtimeStart        runtimeStarter
	constructionChanged chan struct{}
	constructionStreams map[string]int
	crmRoutes           map[string]crmRoute
	voice               *voiceService
	directory           directoryResolver
	calendarEnabled     bool
	calendarGoogle      *calendarGoogleService
	customerSchema      *customerGraphSchema
	customerEnabled     bool
	customerDirectory   string
	customerBusy        chan struct{}
	pendingMetrics      []sdrsdk.WorkerMetricEvent
	metricsLastPrune    time.Time
	ops                 *metricsOpsState
	mu                  sync.Mutex
	state               State
	sessions            map[string]session
	passwords           map[string][32]byte
	users               map[string]User
	harness             map[[32]byte]string
	cursors             map[string]cursor
	file                string
	now                 func() time.Time
	failSave            bool
	db                  *sql.DB
	lockFile            *os.File
	memoryLimits        map[string]limitWindow
	wa                  WAEngine
	pipelineEnabled     bool
	executionModel      string
	workerSecrets       map[string][32]byte
	workerHealth        map[string]WorkerHealth
	transportMu         sync.Mutex
	transportErrors     map[string]string
	mediaEnabled        bool
	mediaBlobs          map[string][]byte
	mediaUploadSlots    chan struct{}
	mediaDownloadSlots  chan struct{}
}

func token() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func newApp(file string) (*App, map[string]string, error) {
	a := &App{memoryLimits: map[string]limitWindow{}, file: file, now: time.Now, sessions: map[string]session{}, passwords: map[string][32]byte{}, users: map[string]User{}, harness: map[[32]byte]string{}, cursors: map[string]cursor{}}
	if err := a.configureDirectory(); err != nil {
		return nil, nil, err
	}
	a.state = State{Conversations: map[string]*Conversation{}, Messages: map[string][]Message{}, Events: map[string][]Event{}, Results: map[string]result{}, Generation: map[string]int{}, Busy: map[string]bool{}}
	credentials := map[string]string{}
	for _, company := range []string{"alfa", "beta"} {
		org := "org_demo_" + company
		id := "conv_demo_" + company
		a.state.Conversations[id] = &Conversation{ID: id, Contact: "contact_demo_" + company, Org: org, Channel: "fake_whatsapp", Automation: "active", Updated: a.now().UTC()}
		for _, role := range []string{"viewer", "operator", "admin"} {
			name := company + "." + role
			pass := token()
			a.passwords[name] = sha256.Sum256([]byte(pass))
			a.users[name] = User{ID: "user_" + company + "_" + role, Org: org, Role: role, Environment: "isolated-test"}
			credentials[name] = pass
		}
		key := token()
		a.harness[sha256.Sum256([]byte(key))] = "conn_demo_" + company
		credentials["harness."+company] = key
	}
	if err := a.openStore(file); err != nil {
		return nil, nil, err
	}
	if err := a.initWAStore(); err != nil {
		a.Close()
		return nil, nil, err
	}
	// Never replay work whose fake delivery was already marked busy before restart.
	for _, task := range a.state.Tasks {
		if a.state.Busy[task.Conversation] {
			for i := range a.state.Messages[task.Conversation] {
				m := &a.state.Messages[task.Conversation][i]
				if m.ID == task.Message {
					m.Status = "uncertain"
				}
			}
		}
	}
	a.state.Busy = map[string]bool{}
	// Pending audit entries are never reinserted after restart; they are in the audit table.
	a.state.Audit = nil
	if err := a.initBusinessCore(); err != nil {
		a.Close()
		return nil, nil, err
	}
	a.initPipeline()
	a.initPlatform()
	a.initTransport()
	if a.state.Voice.Configs == nil {
		a.state.Voice.Configs = map[string]voiceConfig{}
	}
	if a.state.Voice.Calls == nil {
		a.state.Voice.Calls = map[string]*voiceRequest{}
	}
	if err := a.initMetricsEvents(); err != nil {
		a.Close()
		return nil, nil, err
	}
	if err := a.initMedia(); err != nil {
		a.Close()
		return nil, nil, err
	}
	if err := a.initCustomerData(); err != nil {
		a.Close()
		return nil, nil, err
	}
	if err := a.initCalendars(); err != nil {
		a.Close()
		return nil, nil, err
	}
	if err := a.save(); err != nil {
		a.Close()
		return nil, nil, err
	}
	return a, credentials, nil
}
func (a *App) transact(fn func()) error {
	b, _ := json.Marshal(a.state)
	pending := len(a.pendingMetrics)
	fn()
	if e := a.save(); e != nil {
		a.pendingMetrics = a.pendingMetrics[:pending]
		a.state = State{}
		_ = json.Unmarshal(b, &a.state)
		return e
	}
	return nil
}
func write(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, code int, s string) {
	write(w, code, map[string]any{"error": s, "request_id": token(), "retryable": code == 503 || s == "contact_busy"})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil || d.Decode(new(any)) != io.EOF {
		fail(w, 400, "invalid_json")
		return false
	}
	return true
}
func (a *App) event(c *Conversation, kind, id string) {
	a.state.Events[c.Org] = append(a.state.Events[c.Org], Event{token(), "", kind, c.ID, id, a.now().UTC()})
}
func (a *App) touch(c *Conversation) {
	c.Revision++
	c.Updated = a.now().UTC()
	a.event(c, "conversation.updated", c.ID)
}
func (a *App) message(c *Conversation, text, author string) Message {
	direction, status := "outbound", "queued"
	if author == "lead" {
		direction, status = "inbound", "received"
	}
	m := Message{ID: token(), Conversation: c.ID, Sequence: len(a.state.Messages[c.ID]) + 1, Direction: direction, Author: author, Text: text, Status: status, Created: a.now().UTC()}
	a.state.Messages[c.ID] = append(a.state.Messages[c.ID], m)
	a.touch(c)
	a.event(c, "message.created", m.ID)
	return m
}
func (a *App) issueCursor(c cursor) string { k := token(); a.cursors[k] = c; return k }
func (a *App) Handler() http.Handler {
	return a.directoryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/"+voicePath+"/twilio/") {
			a.voiceWebhook(w, r)
			return
		}
		if r.URL.Path == "/"+voicePath+"/activate" {
			a.activateVoiceHTTP(w, r)
			return
		}
		if a.genesisDemoHTTP(w, r) {
			return
		}
		if a.crmHTTP(w, r) {
			return
		}
		if a.calendarHTTP(w, r) {
			return
		}
		if a.customerHTTP(w, r) {
			return
		}
		if a.prepareMediaUpload(w, r) {
			return
		}
		a.serve(w, r)
	}))
}
func (a *App) serve(w http.ResponseWriter, r *http.Request) {
	if a.metricsOps(w, r) {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !pilotCORS(w, r) {
		return
	}
	if strings.HasPrefix(r.URL.Path, "/__test/v1/") {
		fail(w, 404, "not_found")
		return
	}
	path := strings.Trim(r.URL.Path, "/")
	if r.Method == "GET" && path == "v1/platform/openapi.json" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(platformOpenAPI)
		return
	}
	if r.Method == "POST" && path == "__test/ui/local-enter" && os.Getenv("SDR_GENESIS_DEMO") == "true" && os.Getenv("SDR_CRM_DEV_ENABLED") == "true" {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if host != "127.0.0.1" {
			fail(w, 403, "forbidden")
			return
		}
		raw, err := os.ReadFile(filepath.Join("lab-data", "credentials.json"))
		var codes map[string]string
		if err != nil || json.Unmarshal(raw, &codes) != nil {
			fail(w, 503, "unavailable")
			return
		}
		body, _ := json.Marshal(map[string]string{"company": "alfa", "role": "admin", "access_code": codes["alfa.admin"]})
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		a.demoLogin(w, r)
		return
	}
	if r.Method == "POST" && path == "__test/ui/login" {
		a.demoLogin(w, r)
		return
	}
	parts := strings.Split(path, "/")
	if r.Method == "POST" && path == "v1/sdr/auth/login" {
		var b struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if !a.allow(w, r, []quota{{"login-ip:" + remoteIP(r), 120, 15 * time.Minute}}) {
			return
		}
		if !decode(w, r, &b) {
			return
		}
		if !a.allow(w, r, []quota{{"login-user:" + strings.ToLower(b.Username), 10, 15 * time.Minute}}) {
			return
		}
		hash, ok := a.passwords[b.Username]
		if !ok || hash != sha256.Sum256([]byte(b.Password)) {
			if !a.authAudit(w, b.Username, "login.denied") {
				return
			}
			fail(w, 401, "unauthorized")
			return
		}
		key := token()
		if _, err := a.directoryUser(r.Context(), a.users[b.Username]); err != nil {
			directoryFailure(w, err)
			return
		}
		if !a.authAudit(w, b.Username, "login.accepted") {
			return
		}
		if err := a.prepareWhatsApp(a.users[b.Username].Org); err != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		expiry := a.now().Add(time.Hour)
		a.sessions[fmt.Sprintf("%x", sha256.Sum256([]byte(key)))] = session{a.users[b.Username], expiry}
		write(w, 200, map[string]any{"access_token": key, "token_type": "Bearer", "expires_at": expiry})
		return
	}
	if len(parts) == 5 && parts[0] == "__test" && parts[1] == "v1" && parts[2] == "connections" && parts[4] == "inbound" && r.Method == "POST" {
		a.inbound(w, r, parts[3])
		return
	}
	key := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	s, ok := a.sessions[fmt.Sprintf("%x", sha256.Sum256([]byte(key)))]
	if !ok || !s.Expires.After(a.now()) {
		fail(w, 401, "unauthorized")
		return
	}
	u, directoryErr := a.directoryUser(r.Context(), s.User)
	if directoryErr != nil {
		directoryFailure(w, directoryErr)
		return
	}
	if !a.allow(w, r, []quota{{"read:" + u.Org + ":" + u.ID, 300, time.Minute}}) {
		return
	}
	if r.Method == "POST" && !a.allow(w, r, []quota{{"command:" + u.Org + ":" + u.ID, 60, time.Minute}}) {
		return
	}
	if a.mediaRoute(w, r, u, path) {
		return
	}
	if path == voicePath || strings.HasPrefix(path, voicePath+"/") {
		a.voiceRoute(w, r, u, path)
		return
	}
	if path == "v1/sdr/whatsapp" || strings.HasPrefix(path, "v1/sdr/whatsapp/") {
		a.whatsAppRoute(w, r, u, path)
		return
	}
	if strings.HasPrefix(path, "v1/platform/") {
		a.platformRoute(w, r, u, path)
		return
	}
	if strings.HasPrefix(path, "v1/core/") {
		a.businessRoute(w, r, u, path)
		return
	}
	if r.Method == "GET" && path == "v1/sdr/audit" {
		a.listAudit(w, r, u)
		return
	}
	if r.Method == "POST" && path == "__test/ui/inbound" {
		a.demoInbound(w, r, u)
		return
	}
	if r.Method == "POST" && path == "__test/ui/conversations" {
		a.createTestConversation(w, r, u)
		return
	}
	if r.Method == "GET" && path == "v1/sdr/me" {
		write(w, 200, u)
		return
	}
	if r.Method == "GET" && path == "v1/sdr/runtime" {
		write(w, 200, a.pipelineStatus(u, nil))
		return
	}
	if r.Method == "GET" && path == "v1/sdr/events" {
		a.events(w, r, u)
		return
	}
	if r.Method == "GET" && path == "v1/sdr/conversations" {
		a.list(w, r, u, nil)
		return
	}
	if len(parts) >= 4 && parts[0] == "v1" && parts[1] == "sdr" && parts[2] == "conversations" {
		c := a.state.Conversations[parts[3]]
		if c == nil || c.Org != u.Org {
			if !a.deniedAudit(w, u, "resource.denied") {
				return
			}
			fail(w, 404, "not_found")
			return
		}
		if len(parts) == 4 && r.Method == "GET" {
			write(w, 200, c)
			return
		}
		if len(parts) == 5 {
			if parts[4] == "runtime" && r.Method == "GET" {
				write(w, 200, a.pipelineStatus(u, c))
				return
			}
			if parts[4] == "context" && r.Method == "GET" {
				a.conversationContext(w, r, u, c)
				return
			}
			if parts[4] == "messages" && r.Method == "GET" {
				a.list(w, r, u, c)
				return
			}
			if r.Method == "POST" && (parts[4] == "messages" || parts[4] == "actions") {
				a.command(w, r, u, c, parts[4])
				return
			}
		}
	}
	fail(w, 404, "not_found")
}
func (a *App) inbound(w http.ResponseWriter, r *http.Request, connection string) {
	k := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if a.harness[sha256.Sum256([]byte(k))] != connection {
		fail(w, 401, "unauthorized")
		return
	}
	if !a.allow(w, r, []quota{{"harness:" + connection, 120, time.Minute}}) {
		return
	}
	a.acceptInbound(w, r, connection)
}
func (a *App) acceptInbound(w http.ResponseWriter, r *http.Request, connection string) {
	var b struct {
		Event        string `json:"provider_event_id"`
		Conversation string `json:"conversation_id"`
		Text         string `json:"text"`
	}
	if !decode(w, r, &b) {
		return
	}
	c := a.state.Conversations[b.Conversation]
	company := strings.TrimPrefix(connection, "conn_demo_")
	if c == nil || c.Org != "org_demo_"+company {
		fail(w, 404, "not_found")
		return
	}
	if c.Channel != "fake_whatsapp" {
		fail(w, 422, "test_conversation_required")
		return
	}
	if b.Event == "" || strings.TrimSpace(b.Text) == "" || len([]rune(b.Text)) > 4000 {
		fail(w, 422, "validation_error")
		return
	}
	raw, _ := json.Marshal(b)
	fp := fmt.Sprintf("%x", sha256.Sum256(raw))
	resultKey := "inbound:" + c.Org + ":" + connection + ":" + b.Event
	if a.replay(w, resultKey, fp) {
		return
	}
	var resultBody map[string]any
	err := a.transact(func() {
		m := a.message(c, b.Text, "lead")
		resultBody = map[string]any{"event_id": token(), "message_id": m.ID, "duplicate": false}
		if a.pipelineEnabled {
			c.InputVersion++
			a.invalidatePipeline(c, true)
			a.cancelOldAutomatic(c)
			if pipelineOptOut(b.Text) {
				c.OptedOut = true
				c.Automation = "paused"
				a.state.Generation[c.ID]++
				a.invalidatePipeline(c, false)
				a.touch(c)
			} else if c.Automation == "active" && !c.OptedOut {
				if _, ok := a.solutionBusiness(c.Org, "sdr", 0); ok {
					a.queueContext(c, m.ID)
					resultBody["processing"] = "context_queued"
				} else {
					resultBody["automation_blocked_reason"] = "solution_unavailable"
				}
			}
		} else if c.Automation == "active" && !c.OptedOut {
			if receipt, ok := a.prepareBusinessContext(c); ok {
				reply := a.message(c, "[SIMULAÇÃO] Recebemos sua mensagem.", "assistant")
				messages := a.state.Messages[c.ID]
				messages[len(messages)-1].BusinessVersion = receipt.BusinessVersion
				a.state.Messages[c.ID] = messages
				a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: reply.ID, Org: c.Org, Generation: a.state.Generation[c.ID], Automatic: true})
				resultBody["business_version"] = receipt.BusinessVersion
			} else {
				resultBody["automation_blocked_reason"] = "solution_unavailable"
			}
		}
		enc, _ := json.Marshal(resultBody)
		a.state.Results[resultKey] = result{fp, enc, 202}
		a.record(AuditEntry{Org: c.Org, Actor: "harness:" + connection, Action: "inbound.accepted", Conversation: c.ID, Operation: resultBody["event_id"].(string), Revision: c.Revision})
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 202, resultBody)
}
func (a *App) replay(w http.ResponseWriter, key, fp string) bool {
	old, ok := a.state.Results[key]
	if !ok {
		return false
	}
	if old.Fingerprint != fp {
		fail(w, 409, "idempotency_conflict")
		return true
	}
	var b map[string]any
	_ = json.Unmarshal(old.Body, &b)
	b["duplicate"] = true
	write(w, old.Code, b)
	return true
}
func (a *App) command(w http.ResponseWriter, r *http.Request, u User, c *Conversation, kind string) {
	if u.Role == "viewer" {
		if !a.deniedAudit(w, u, "command.denied") {
			return
		}
		fail(w, 403, "forbidden")
		return
	}
	var body struct {
		Kind     string `json:"kind,omitempty"`
		Reason   string `json:"reason,omitempty"`
		Text     string `json:"text,omitempty"`
		MediaID  string `json:"media_id,omitempty"`
		Revision *int   `json:"expected_revision"`
	}
	decodeCommand := decode
	if c.Channel == "whatsapp" {
		decodeCommand = decodeCore
	}
	if !decodeCommand(w, r, &body) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 || body.Revision == nil || *body.Revision < 0 {
		fail(w, 422, "validation_error")
		return
	}
	if kind == "messages" && (body.Kind != "" || body.Reason != "" || (strings.TrimSpace(body.Text) == "" && body.MediaID == "") || len([]rune(body.Text)) > 4000) {
		fail(w, 422, "validation_error")
		return
	}
	if kind == "actions" && (body.MediaID != "" || body.Text != "" || strings.TrimSpace(body.Reason) == "" || len([]rune(body.Reason)) > 1000 || (body.Kind != "pause" && body.Kind != "takeover" && body.Kind != "resume")) {
		fail(w, 422, "validation_error")
		return
	}
	raw, _ := json.Marshal(body)
	fp := fmt.Sprintf("%x", sha256.Sum256(append([]byte(r.URL.Path), raw...)))
	rk := u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fp) {
		return
	}
	if c.Revision != *body.Revision {
		fail(w, 409, "revision_conflict")
		return
	}
	if a.state.Busy[c.ID] {
		fail(w, 409, "contact_busy")
		return
	}
	if c.OptedOut && (kind == "messages" || body.Kind == "resume") {
		fail(w, 409, "automation_blocked")
		return
	}
	if kind == "messages" && c.Automation == "active" {
		fail(w, 409, "human_control_required")
		return
	}
	if body.MediaID != "" && !a.usableOutgoingMedia(u, c, body.MediaID) {
		fail(w, 409, "media_not_ready")
		return
	}
	if body.MediaID != "" {
		if asset := a.state.Media.Assets[body.MediaID]; asset != nil && ((asset.File.Kind == "audio" && body.Text != "") || len([]rune(body.Text)) > 1000) {
			fail(w, 422, "media_caption_invalid")
			return
		}
	}
	code := 200
	if kind == "messages" {
		code = 202
	}
	var response map[string]any
	err := a.transact(func() {
		response = map[string]any{"operation_id": token(), "duplicate": false}
		if kind == "messages" {
			m := a.message(c, body.Text, "human")
			if body.MediaID != "" {
				asset := a.state.Media.Assets[body.MediaID]
				m.Media = &MessageMedia{ID: asset.ID, Kind: asset.File.Kind, MIME: asset.File.MIME, Name: asset.File.Name, Size: asset.File.Size, Status: "ready"}
				list := a.state.Messages[c.ID]
				list[len(list)-1].Media = m.Media
				a.state.Messages[c.ID] = list
			}
			a.state.Tasks = append(a.state.Tasks, Task{Conversation: c.ID, Message: m.ID, Org: c.Org, Generation: a.state.Generation[c.ID], Automatic: false})
			response["message"] = m
		} else {
			if body.Kind == "resume" {
				c.Automation = "active"
				now := a.now().UTC()
				c.ResumedAt = &now
			} else {
				c.Automation = "human"
				if body.Kind == "pause" {
					c.Automation = "paused"
				}
				a.state.Generation[c.ID]++
				a.invalidatePipeline(c, false)
				for i := range a.state.Messages[c.ID] {
					m := &a.state.Messages[c.ID][i]
					if m.Author == "assistant" && m.Status == "queued" {
						m.Status = "cancelled"
						a.event(c, "message.updated", m.ID)
					}
				}
			}
			a.touch(c)
			snapshot := *c
			response["conversation"] = snapshot
		}
		enc, _ := json.Marshal(response)
		a.state.Results[rk] = result{fp, enc, code}
		action := body.Kind
		if kind == "messages" {
			action = "message.queued"
		}
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: action, Conversation: c.ID, Operation: response["operation_id"].(string), Revision: c.Revision, Reason: body.Reason})
	})
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, code, response)
}
func (a *App) list(w http.ResponseWriter, r *http.Request, u User, c *Conversation) {
	scope := "conversations"
	if c != nil {
		scope = c.ID
	}
	limit := 30
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if _, e := fmt.Sscan(raw, &limit); e != nil || limit < 1 || limit > 100 {
			fail(w, 422, "validation_error")
			return
		}
	}
	cur := cursor{Org: u.Org, Scope: scope, At: a.now()}
	if k := r.URL.Query().Get("cursor"); k != "" {
		v, ok := a.cursors[k]
		if !ok || v.Org != u.Org || v.Scope != scope || a.now().Sub(v.At) > 15*time.Minute {
			fail(w, 400, "invalid_cursor")
			return
		}
		cur = v
	} else if c != nil {
		all := a.state.Messages[c.ID]
		for i := len(all) - 1; i >= 0; i-- {
			cur.Messages = append(cur.Messages, all[i])
		}
	} else {
		for _, v := range a.state.Conversations {
			if v.Org == u.Org {
				cur.Conversations = append(cur.Conversations, *v)
			}
		}
	}
	sort.SliceStable(cur.Conversations, func(i, j int) bool {
		x, y := cur.Conversations[i], cur.Conversations[j]
		if x.Updated.Equal(y.Updated) {
			return x.ID > y.ID
		}
		return x.Updated.After(y.Updated)
	})
	total := len(cur.Conversations)
	if c != nil {
		total = len(cur.Messages)
	}
	end := min(cur.Position+limit, total)
	var items any
	if c != nil {
		items = cur.Messages[cur.Position:end]
	} else {
		items = cur.Conversations[cur.Position:end]
	}
	if total == 0 {
		items = []any{}
	}
	var next any
	if end < total {
		cur.Position = end
		next = a.issueCursor(cur)
	}
	write(w, 200, map[string]any{"items": items, "next_cursor": next})
}
func (a *App) events(w http.ResponseWriter, r *http.Request, u User) {
	ev := a.state.Events[u.Org]
	cur := cursor{Org: u.Org, Scope: "events", At: a.now(), Position: len(ev)}
	items := []Event{}
	more := false
	if k := r.URL.Query().Get("after"); k != "" {
		v, ok := a.cursors[k]
		if !ok || v.Org != u.Org || v.Scope != "events" || a.now().Sub(v.At) > 24*time.Hour {
			fail(w, 400, "invalid_cursor")
			return
		}
		cur = v
		limit := 50
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if _, e := fmt.Sscan(raw, &limit); e != nil || limit < 1 || limit > 100 {
				fail(w, 422, "validation_error")
				return
			}
		}
		end := min(cur.Position+limit, len(ev))
		items = append(items, ev[cur.Position:end]...)
		cur.Position = end
		more = end < len(ev)
	}
	cur.At = a.now()
	next := a.issueCursor(cur)
	for i := range items {
		items[i].Cursor = next
	}
	write(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
}

// Drain executes only local fake deliveries, atomically under the same fence as human actions.
func (a *App) Drain() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.state.Tasks) == 0 {
		return nil
	}
	return a.transact(func() {
		remaining := []Task{}
		for _, t := range a.state.Tasks {
			c := a.state.Conversations[t.Conversation]
			if c == nil || c.Org != t.Org {
				continue
			}
			if c.Channel == "whatsapp" {
				remaining = append(remaining, t)
				continue
			}
			if a.state.Busy[c.ID] {
				remaining = append(remaining, t)
				continue
			}
			for i := range a.state.Messages[c.ID] {
				m := &a.state.Messages[c.ID][i]
				if m.ID != t.Message || m.Status != "queued" {
					continue
				}
				runInvalid := false
				if t.RunID != "" {
					run := a.state.Pipeline.Runs[t.RunID]
					runInvalid = run == nil || run.Status != "completed" || !a.pipelineFence(c, run.Context)
				}
				if runInvalid || !a.workflowMediaDeliveryAllowed(c, m) || c.OptedOut || (t.Automatic && (c.Automation != "active" || t.Generation != a.state.Generation[c.ID])) {
					m.Status = "cancelled"
				} else {
					m.Status = "sent"
				}
				a.touch(c)
				a.event(c, "message.updated", m.ID)
				a.record(AuditEntry{Org: c.Org, Actor: "fake-worker", Action: "message." + m.Status, Conversation: c.ID, Operation: m.ID, Revision: c.Revision})
			}
		}
		a.state.Tasks = remaining
	})
}
func main() {
	if platformWebEntrypoint() {
		return
	}
	if workerEntrypoint() {
		return
	}
	startGenesisDemo()
	// Intentionally ignores all existing SDR/Supabase environment configuration.
	dir := "lab-data"
	if err := os.MkdirAll(dir, 0700); err != nil {
		log.Fatal(err)
	}
	dir, _ = filepath.Abs(dir)
	a, credentials, err := newApp(filepath.Join(dir, "state.sqlite"))
	if err != nil {
		log.Fatal(err)
	}
	if saved, err := os.ReadFile(filepath.Join(dir, "credentials.json")); err == nil {
		var stored map[string]string
		if err = json.Unmarshal(saved, &stored); err != nil {
			log.Fatal("invalid pilot credential file")
		}
		for name := range credentials {
			if len(stored[name]) < 32 {
				log.Fatal("incomplete pilot credential file")
			}
		}
		credentials = stored
		for name := range a.passwords {
			a.passwords[name] = sha256.Sum256([]byte(credentials[name]))
		}
		a.harness = map[[32]byte]string{}
		for _, company := range []string{"alfa", "beta"} {
			a.harness[sha256.Sum256([]byte(credentials["harness."+company]))] = "conn_demo_" + company
		}
	} else if !os.IsNotExist(err) {
		log.Fatal("cannot read pilot credential file")
	}
	engine, err := configureWA()
	if err != nil {
		log.Fatal("WhatsApp management configuration invalid")
	}
	a.wa = engine
	if os.Getenv("SDR_VOICE_ENABLED") == "true" {
		if err := a.configureVoice(); err != nil {
			log.Fatal("voice configuration invalid")
		}
		go a.runVoiceWorker(context.Background())
	}
	if os.Getenv("SDR_CALENDAR_ENABLED") == "true" {
		if os.Getenv("SDR_PIPELINE_ENABLED") != "true" {
			log.Fatal("calendar requires isolated worker listener")
		}
		if err := a.configureCalendars(); err != nil {
			log.Fatal("calendar configuration invalid")
		}
	}
	if err := a.configureCRM(); err != nil {
		log.Fatal("CRM integration configuration invalid")
	}
	if len(a.crmRoutes) > 0 {
		go a.runCRM(context.Background())
	}
	if err := a.configurePipeline(); err != nil {
		log.Fatal("isolated worker configuration invalid")
	}
	if os.Getenv("SDR_CUSTOMER_DATA_ENABLED") == "true" {
		if err := a.configureCustomerData(); err != nil {
			log.Fatal("customer data configuration invalid")
		}
		go a.runDataWorker(context.Background())
	}
	if engine != nil {
		go func() {
			timer := time.NewTicker(2 * time.Second)
			defer timer.Stop()
			for range timer.C {
				ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
				if a.TransportTick(ctx) != nil {
					log.Print("isolated text transport retry pending")
				}
				cancel()
			}
		}()
		go func() {
			timer := time.NewTicker(3 * time.Second)
			defer timer.Stop()
			for range timer.C {
				ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
				if e := a.WhatsAppTick(ctx); e != nil {
					log.Print("WhatsApp management retry pending")
				}
				cancel()
			}
		}()
	}
	b, _ := json.MarshalIndent(credentials, "", "  ")
	if err = os.WriteFile(filepath.Join(dir, "credentials.json"), b, 0600); err != nil {
		log.Fatal(err)
	}
	listenAddress := "0.0.0.0:8080"
	if os.Getenv("SDR_CRM_DEV_ENABLED") == "true" {
		listenAddress = "127.0.0.1:8080"
	}
	listener, err := net.Listen("tcp4", listenAddress)
	if err != nil {
		log.Fatal(err)
	}
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := a.Drain(); err != nil {
				log.Print("local storage unavailable")
			}
		}
	}()
	log.Print("SDR next pilot: isolated API; protected access; delivery restricted to test conversations")
	formOrigins := []string{}
	if a.calendarGoogle != nil {
		u, _ := url.Parse(a.calendarGoogle.Config.Redirect)
		formOrigins = []string{u.Scheme + "://" + u.Host, "https://accounts.google.com"}
	}
	log.Fatal((&http.Server{Handler: laboratoryUI(a.Handler(), formOrigins...), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 40 * time.Second, WriteTimeout: 45 * time.Second, IdleTimeout: 30 * time.Second}).Serve(listener))
}
