package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type WhatsAppView struct {
	Status          string     `json:"status"`
	Provisioning    string     `json:"provisioning"`
	QRDataURL       string     `json:"qr_data_url,omitempty"`
	PairingCode     string     `json:"pairing_code,omitempty"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	OperationID     string     `json:"operation_id,omitempty"`
	OperationStatus string     `json:"operation_status,omitempty"`
	Error           string     `json:"error,omitempty"`
}
type WAEngine interface {
	Ensure(context.Context, string) error
	Status(context.Context, string) (WhatsAppView, error)
	Command(context.Context, string, string, string, string) error
	Result(context.Context, string, string) (WhatsAppView, error)
}
type engineClient struct {
	base   string
	secret string
	http   *http.Client
}

func configureWA() (WAEngine, error) {
	base := os.Getenv("SDR_WHATSAPP_ENGINE_URL")
	path := os.Getenv("SDR_WHATSAPP_ENGINE_TOKEN_FILE")
	if base == "" && path == "" {
		return nil, nil
	}
	u, err := url.Parse(base)
	// Keep the Docker address in production and permit the dedicated loopback bridge in the local demo.
	expectedHost := "sdr-wa-bridge:8080"
	if os.Getenv("ARKOM_LOCAL_DEMO") == "true" && os.Getenv("SDR_CRM_DEV_ENABLED") == "true" {
		expectedHost = "127.0.0.1:18083"
	}
	if err != nil || u.Scheme != "http" || u.Host != expectedHost || u.Path != "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid private WhatsApp engine address")
	}
	raw, err := os.ReadFile(path)
	if err != nil || len(strings.TrimSpace(string(raw))) < 40 {
		return nil, errors.New("WhatsApp engine token missing")
	}
	return &engineClient{base: base, secret: strings.TrimSpace(string(raw)), http: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (e *engineClient) call(ctx context.Context, method, path string, body any, out any) error {
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, e.base+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.secret)
	req.Header.Set("Content-Type", "application/json")
	res, err := e.http.Do(req)
	if err != nil {
		return errors.New("whatsapp_temporarily_unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return errors.New("whatsapp_temporarily_unavailable")
	}
	if out != nil {
		return json.NewDecoder(io.LimitReader(res.Body, 700000)).Decode(out)
	}
	return nil
}
func (e *engineClient) Ensure(ctx context.Context, org string) error {
	return e.call(ctx, "POST", "/internal/accounts/"+url.PathEscape(org), map[string]string{}, nil)
}
func (e *engineClient) Status(ctx context.Context, org string) (WhatsAppView, error) {
	var v WhatsAppView
	err := e.call(ctx, "GET", "/internal/accounts/"+url.PathEscape(org), nil, &v)
	return v, err
}
func (e *engineClient) Command(ctx context.Context, org, key, kind, phone string) error {
	return e.call(ctx, "POST", "/internal/accounts/"+url.PathEscape(org)+"/commands", map[string]string{"idempotency_key": key, "kind": kind, "phone": phone}, nil)
}
func (e *engineClient) Result(ctx context.Context, org, key string) (WhatsAppView, error) {
	var v WhatsAppView
	err := e.call(ctx, "GET", "/internal/accounts/"+url.PathEscape(org)+"/commands/"+url.PathEscape(key), nil, &v)
	return v, err
}
func (a *App) initWAStore() error {
	if a.db == nil {
		return nil
	}
	_, err := a.db.Exec(`CREATE TABLE IF NOT EXISTS whatsapp_channels(organization_id TEXT PRIMARY KEY,provisioning TEXT NOT NULL DEFAULT 'pending',view BLOB NOT NULL DEFAULT '{}',updated_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS whatsapp_jobs(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,actor_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,fingerprint TEXT NOT NULL,kind TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,UNIQUE(organization_id,actor_id,idempotency_key));`)
	return err
}

// Login identifies the organization; the Remix never contains a provider key.
func (a *App) prepareWhatsApp(org string) error {
	if a.wa == nil || a.db == nil {
		return nil
	}
	_, err := a.db.Exec(`INSERT INTO whatsapp_channels(organization_id) VALUES(?) ON CONFLICT DO NOTHING`, org)
	return err
}
func publicWA(v WhatsAppView, now time.Time) WhatsAppView {
	if v.ExpiresAt != nil && !v.ExpiresAt.After(now) {
		v.QRDataURL = ""
		v.PairingCode = ""
		if v.Status == "waiting_qr_scan" || v.Status == "pair_code" {
			v.Status = "expired"
		}
	}
	if v.Status == "connected" {
		v.QRDataURL = ""
		v.PairingCode = ""
		v.ExpiresAt = nil
	}
	return v
}
func (a *App) whatsAppRoute(w http.ResponseWriter, r *http.Request, u User, path string) {
	if path == "v1/sdr/whatsapp/messaging" {
		a.messagingRoute(w, r, u)
		return
	}
	if a.wa == nil || a.db == nil {
		fail(w, 503, "whatsapp_not_configured")
		return
	}
	if r.Method == "GET" && path == "v1/sdr/whatsapp" {
		var provisioning string
		var raw []byte
		err := a.db.QueryRow("SELECT provisioning,view FROM whatsapp_channels WHERE organization_id=?", u.Org).Scan(&provisioning, &raw)
		if errors.Is(err, sql.ErrNoRows) {
			write(w, 200, WhatsAppView{Status: "preparing", Provisioning: "pending"})
			return
		}
		if err != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		var v WhatsAppView
		_ = json.Unmarshal(raw, &v)
		v.Provisioning = provisioning
		if v.Status == "" {
			v.Status = "preparing"
		}
		v = publicWA(v, a.now())
		if u.Role == "viewer" {
			v.QRDataURL = ""
			v.PairingCode = ""
			v.ExpiresAt = nil
		}
		write(w, 200, v)
		return
	}
	if r.Method != "POST" || path != "v1/sdr/whatsapp/connect" {
		fail(w, 404, "not_found")
		return
	}
	if u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return
	}
	if !a.allow(w, r, []quota{{"whatsapp-command:" + u.Org, 6, time.Minute}}) {
		return
	}
	var b struct {
		Method string `json:"method"`
		Phone  string `json:"phone,omitempty"`
	}
	if !decode(w, r, &b) {
		return
	}
	if b.Method != "qr" && b.Method != "phone" && b.Method != "disconnect" {
		fail(w, 422, "validation_error")
		return
	}
	if b.Method == "phone" {
		b.Phone = strings.NewReplacer("+", "", " ", "", "-", "", "(", "", ")", "").Replace(b.Phone)
		if len(b.Phone) < 10 || len(b.Phone) > 15 || strings.Trim(b.Phone, "0123456789") != "" {
			fail(w, 422, "invalid_phone")
			return
		}
	} else if b.Phone != "" {
		fail(w, 422, "validation_error")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 1 || len(key) > 100 {
		fail(w, 422, "validation_error")
		return
	}
	encoded, _ := json.Marshal(b)
	fp := fmt.Sprintf("%x", sha256.Sum256(encoded))
	var id, existingFP string
	err := a.db.QueryRow("SELECT id,fingerprint FROM whatsapp_jobs WHERE organization_id=? AND actor_id=? AND idempotency_key=?", u.Org, u.ID, key).Scan(&id, &existingFP)
	if err == nil {
		if fp != existingFP {
			fail(w, 409, "idempotency_conflict")
			return
		}
		write(w, 202, map[string]any{"operation_id": id, "duplicate": true})
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		fail(w, 503, "storage_unavailable")
		return
	}
	var count int
	err = a.db.QueryRow("SELECT count(*) FROM whatsapp_jobs WHERE organization_id=? AND status IN ('pending','processing')", u.Org).Scan(&count)
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	if count > 0 {
		fail(w, 409, "connection_busy")
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	defer tx.Rollback()
	id = token()
	_, err = tx.Exec(`INSERT INTO whatsapp_channels(organization_id) VALUES(?) ON CONFLICT DO NOTHING`, u.Org)
	if err == nil {
		_, err = tx.Exec(`INSERT INTO whatsapp_jobs(id,organization_id,actor_id,idempotency_key,fingerprint,kind,phone,created_at) VALUES(?,?,?,?,?,?,?,?)`, id, u.Org, u.ID, key, fp, b.Method, b.Phone, a.now().Unix())
	}
	if err == nil {
		_, err = tx.Exec(`INSERT INTO audit(id,organization_id,actor_id,action,conversation_id,operation_id,revision,reason,at) VALUES(?,?,?,?,?,?,?,?,?)`, token(), u.Org, u.ID, "whatsapp."+b.Method+".requested", "", id, 0, "", a.now().UTC().Format(time.RFC3339Nano))
	}
	view, _ := json.Marshal(WhatsAppView{Status: "preparing", OperationID: id, OperationStatus: "pending"})
	if err == nil {
		_, err = tx.Exec("UPDATE whatsapp_channels SET view=? WHERE organization_id=?", view, u.Org)
	}
	if err != nil || tx.Commit() != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 202, map[string]any{"operation_id": id, "duplicate": false})
}

type waJob struct {
	id, org, kind, phone string
	attempts             int
}

// One durable management worker for the dedicated pilot process. Network work is
// outside App.mu, so a slow pairing socket cannot block human takeover or login.
func (a *App) WhatsAppTick(ctx context.Context) error {
	if a.wa == nil || a.db == nil {
		return nil
	}
	a.mu.Lock()
	rows, err := a.db.Query("SELECT organization_id FROM whatsapp_channels ORDER BY updated_at LIMIT 20")
	orgs := []string{}
	if err == nil {
		for rows.Next() {
			var org string
			if e := rows.Scan(&org); e != nil {
				err = e
				break
			}
			orgs = append(orgs, org)
		}
		rows.Close()
	}
	a.mu.Unlock()
	if err != nil {
		return err
	}
	for _, org := range orgs {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err = a.wa.Ensure(ctx, org); err != nil {
			a.mu.Lock()
			_, _ = a.db.Exec("UPDATE whatsapp_channels SET provisioning='retrying' WHERE organization_id=?", org)
			a.mu.Unlock()
			continue
		}
		a.mu.Lock()
		var job waJob
		err = a.db.QueryRow(`SELECT id,organization_id,kind,phone,attempts FROM whatsapp_jobs WHERE organization_id=? AND status IN ('pending','processing') AND next_at<=? ORDER BY created_at,id LIMIT 1`, org, a.now().Unix()).Scan(&job.id, &job.org, &job.kind, &job.phone, &job.attempts)
		a.mu.Unlock()
		var result *WhatsAppView
		var jobErr error
		if err == nil {
			jobErr = a.wa.Command(ctx, job.org, job.id, job.kind, job.phone)
			if jobErr == nil {
				v, e := a.wa.Result(ctx, job.org, job.id)
				jobErr = e
				if e == nil {
					result = &v
				}
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		view, statusErr := a.wa.Status(ctx, org)
		if statusErr != nil {
			continue
		}
		if result != nil {
			view.OperationID = job.id
			view.OperationStatus = result.OperationStatus
			if result.PairingCode != "" && view.Status != "connected" {
				view.PairingCode = result.PairingCode
				view.ExpiresAt = result.ExpiresAt
				view.Status = "pair_code"
			}
			view.Error = result.Error
		}
		if jobErr != nil {
			view.OperationID = job.id
			view.OperationStatus = "retrying"
			view.Error = "connection_temporarily_unavailable"
		}
		raw, _ := json.Marshal(view)
		a.mu.Lock()
		tx, e := a.db.Begin()
		if e == nil {
			// Preserve a completed pair code while status polling continues, until it expires or connects.
			if result == nil {
				var previous []byte
				if tx.QueryRow("SELECT view FROM whatsapp_channels WHERE organization_id=?", org).Scan(&previous) == nil {
					var old WhatsAppView
					_ = json.Unmarshal(previous, &old)
					old = publicWA(old, a.now())
					if old.PairingCode != "" && view.Status != "connected" {
						view.PairingCode = old.PairingCode
						view.ExpiresAt = old.ExpiresAt
						view.Status = "pair_code"
					}
					view.OperationID = old.OperationID
					view.OperationStatus = old.OperationStatus
					view.Error = old.Error
					raw, _ = json.Marshal(view)
				}
			}
			_, e = tx.Exec("UPDATE whatsapp_channels SET provisioning='ready',view=?,updated_at=? WHERE organization_id=?", raw, a.now().Unix(), org)
			if e == nil && job.id != "" {
				state := "processing"
				if result != nil && (result.OperationStatus == "done" || result.OperationStatus == "failed") {
					state = result.OperationStatus
				}
				if jobErr != nil && job.attempts >= 5 {
					state = "failed"
					view.Error = "connection_failed"
					view.OperationStatus = state
					raw, _ = json.Marshal(view)
					_, e = tx.Exec("UPDATE whatsapp_channels SET view=? WHERE organization_id=?", raw, org)
				}
				if e == nil {
					_, e = tx.Exec("UPDATE whatsapp_jobs SET status=?,attempts=attempts+1,next_at=?,phone=CASE WHEN ? IN ('done','failed') THEN '' ELSE phone END WHERE id=?", state, a.now().Add(3*time.Second).Unix(), state, job.id)
				}
				if e == nil && (state == "done" || state == "failed") {
					_, e = tx.Exec(`INSERT INTO audit(id,organization_id,actor_id,action,conversation_id,operation_id,revision,reason,at) VALUES(?,?,?,?,?,?,?,?,?)`, token(), org, "whatsapp-worker", "whatsapp.connection."+state, "", job.id, 0, "", a.now().UTC().Format(time.RFC3339Nano))
				}
			}
			if e == nil {
				e = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
		}
		a.mu.Unlock()
		if e != nil {
			return e
		}
	}
	return nil
}
