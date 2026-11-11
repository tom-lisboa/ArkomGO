package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sdr-next-pilot/internal/dataworker"
	"strings"
	"time"

	graphql "github.com/graph-gophers/graphql-go"
)

type CustomerExport struct {
	ID, Org, Actor, KeyHash, Status, Attempt, SHA256, Error string
	CreatedAt, CapturedAt, ExpiresAt                        time.Time
	Bytes                                                   int64
	Result                                                  dataworker.Result
}

var exportID = regexp.MustCompile(`^exp_[a-f0-9]{48}$`)

func (a *App) initCustomerData() error {
	if a.state.CustomerExports == nil {
		a.state.CustomerExports = map[string]*CustomerExport{}
	}
	for _, j := range a.state.CustomerExports {
		if j.Status == "running" {
			a.metricEnd("data", j.Org, j.ID, j.Attempt, "expired")
			j.Status = "queued"
			j.Attempt = ""
		}
	}
	a.customerBusy = make(chan struct{}, 1)
	schema, e := graphql.ParseSchema(customerSchemaText, &customerRoot{a}, graphql.UseFieldResolvers(), graphql.MaxDepth(8), graphql.MaxSelections(256), graphql.MaxQueryLength(8192), graphql.MaxParallelism(4))
	if e != nil {
		return e
	}
	a.customerSchema = schema
	return nil
}
func (a *App) configureCustomerData() error {
	if a.file == "" {
		return errors.New("customer_data_requires_persistent_store")
	}
	a.customerDirectory = filepath.Join(filepath.Dir(a.file), "customer-exports")
	if e := os.MkdirAll(a.customerDirectory, 0700); e != nil {
		return e
	}
	info, e := os.Lstat(a.customerDirectory)
	if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("invalid_customer_export_directory")
	}
	if e = os.Chmod(a.customerDirectory, 0700); e != nil {
		return e
	}
	a.customerEnabled = true
	return nil
}
func (a *App) customerAuthorize(w http.ResponseWriter, r *http.Request) (User, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !pilotCORS(w, r) {
		return User{}, false
	}
	if !a.customerEnabled {
		fail(w, 404, "not_found")
		return User{}, false
	}
	key := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	s, ok := a.sessions[hex.EncodeToString(key[:])]
	if !ok || !s.Expires.After(a.now()) {
		fail(w, 401, "unauthorized")
		return User{}, false
	}
	u, directoryErr := a.directoryUser(r.Context(), s.User)
	if directoryErr != nil {
		directoryFailure(w, directoryErr)
		return User{}, false
	}
	s.User = u
	if s.User.Role != "admin" {
		if !a.deniedAudit(w, s.User, "customer.data.denied") {
			return User{}, false
		}
		fail(w, 403, "forbidden")
		return User{}, false
	}
	if !a.allow(w, r, []quota{{"customer-data:" + s.User.Org + ":" + s.User.ID, 30, time.Minute}}) {
		return User{}, false
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	return s.User, true
}
func (a *App) customerExportHTTP(w http.ResponseWriter, r *http.Request, u User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || parts[2] != "exports" {
		fail(w, 404, "not_found")
		return
	}
	a.mu.Lock()
	if len(parts) == 3 && r.Method == "POST" {
		defer a.mu.Unlock()
		var body struct{}
		if !decode(w, r, &body) {
			return
		}
		key := r.Header.Get("Idempotency-Key")
		if len(key) < 1 || len(key) > 100 {
			fail(w, 422, "idempotency_key_required")
			return
		}
		hash := fingerprint([]string{u.Org, u.ID, key})
		for _, j := range a.state.CustomerExports {
			if j.Org == u.Org && j.Actor == u.ID && j.KeyHash == hash {
				write(w, 202, exportView(j))
				return
			}
		}
		count := 0
		for _, j := range a.state.CustomerExports {
			if j.Org == u.Org && j.ExpiresAt.After(a.now()) {
				count++
				if j.Status == "queued" || j.Status == "running" {
					fail(w, 409, "export_in_progress")
					return
				}
			}
		}
		if count >= 2 {
			fail(w, 429, "export_limit")
			return
		}
		j := &CustomerExport{ID: "exp_" + token(), Org: u.Org, Actor: u.ID, KeyHash: hash, Status: "queued", CreatedAt: a.now().UTC(), ExpiresAt: a.now().Add(24 * time.Hour).UTC()}
		if a.transact(func() {
			for id, old := range a.state.CustomerExports {
				if !old.ExpiresAt.After(a.now()) {
					delete(a.state.CustomerExports, id)
				}
			}
			a.state.CustomerExports[j.ID] = j
			a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "customer.export.requested", Operation: j.ID})
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		write(w, 202, exportView(j))
		return
	}
	if len(parts) < 4 || !exportID.MatchString(parts[3]) {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	j := a.state.CustomerExports[parts[3]]
	if j == nil || j.Org != u.Org {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	if !j.ExpiresAt.After(a.now()) {
		a.mu.Unlock()
		fail(w, 410, "export_expired")
		return
	}
	if len(parts) == 4 && r.Method == "GET" {
		v := exportView(j)
		a.mu.Unlock()
		write(w, 200, v)
		return
	}
	if len(parts) != 5 || parts[4] != "content" || r.Method != "GET" {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	if j.Status != "ready" {
		a.mu.Unlock()
		fail(w, 409, "export_not_ready")
		return
	}
	path := filepath.Join(a.customerDirectory, j.ID+".zip")
	info, e := os.Lstat(path)
	if e != nil || !info.Mode().IsRegular() || info.Size() != j.Bytes {
		a.mu.Unlock()
		fail(w, 503, "export_unavailable")
		return
	}
	f, e := os.Open(path)
	if e != nil {
		a.mu.Unlock()
		fail(w, 503, "export_unavailable")
		return
	}
	if a.transact(func() {
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "customer.export.downloaded", Operation: j.ID})
	}) != nil {
		f.Close()
		a.mu.Unlock()
		fail(w, 503, "storage_unavailable")
		return
	}
	id := j.ID
	sha := j.SHA256
	captured := j.CapturedAt
	a.mu.Unlock()
	defer f.Close()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="sdr-dados-`+id+`.zip"`)
	w.Header().Set("Digest", "sha-256="+base64.StdEncoding.EncodeToString(mustDecodeHex(sha)))
	http.ServeContent(w, r, id+".zip", captured, f)
}
func mustDecodeHex(s string) []byte { b, _ := hex.DecodeString(s); return b }

// Snapshot metadata is captured once under the API lock. The data worker then
// packages it outside that lock; it never pauses the conversation pipeline.
func (a *App) customerSnapshot(org string) (dataworker.Snapshot, error) {
	s := dataworker.Snapshot{Organization: org, CapturedAt: a.now().UTC(), Records: []dataworker.Record{}, Files: []dataworker.File{}, Coverage: map[string]string{
		"whatsapp_history":        "Only conversations received and retained by this platform. Previous phone history, groups and unsupported message types are not imported.",
		"media_retention":         "Media bytes expire after seven days; unavailable and expired files are listed, not silently omitted.",
		"worker_events_retention": "Source events retain up to seven days; aggregate worker metrics retain up to ninety days.",
		"archive_retention":       "This export expires twenty-four hours after it was requested.",
	}}
	bytes := 0
	for _, collection := range customerCollections {
		records, e := a.customerRecords(org, collection)
		if e != nil {
			return s, e
		}
		for _, r := range records {
			raw, _ := json.Marshal(r)
			bytes += len(raw)
		}
		if bytes > 16<<20 {
			return s, errors.New("export_metadata_limit")
		}
		s.Records = append(s.Records, records...)
	}
	for id, asset := range a.state.Media.Assets {
		if asset.Organization != org {
			continue
		}
		variants := []string{id}
		if asset.Direction == "outbound" {
			variants = append(variants, id+"_raw")
		}
		for _, blobID := range variants {
			f := dataworker.File{ID: blobID, AssetID: id, Name: asset.File.Name, Status: "unavailable"}
			if !asset.Expires.After(a.now()) {
				f.Status = "expired"
				s.Files = append(s.Files, f)
				continue
			}
			if a.db != nil {
				e := a.db.QueryRow("SELECT sha256,length(payload) FROM media_blobs WHERE id=? AND organization_id=? AND expires_at>?", blobID, org, a.now().Unix()).Scan(&f.SHA256, &f.Size)
				if e == nil {
					f.Status = "available"
				}
			} else if b, ok := a.mediaBlobs[blobID]; ok {
				h := sha256.Sum256(b)
				f.SHA256 = hex.EncodeToString(h[:])
				f.Size = int64(len(b))
				f.Status = "available"
			}
			s.Files = append(s.Files, f)
		}
	}
	return s, nil
}
func (a *App) dataExportOnce(ctx context.Context) (bool, error) {
	select {
	case a.customerBusy <- struct{}{}:
		defer func() { <-a.customerBusy }()
	default:
		return false, nil
	}
	a.mu.Lock()
	// A prior attempt can remain running if the final transaction failed. This
	// loop owns the single export slot, so no such attempt is still building.
	for _, j := range a.state.CustomerExports {
		if j.Status == "running" {
			if e := a.transact(func() { a.metricEnd("data", j.Org, j.ID, j.Attempt, "expired"); j.Status = "queued"; j.Attempt = "" }); e != nil {
				a.mu.Unlock()
				return false, e
			}
		}
	}
	// Expired archives and crash leftovers are confined to this private directory.
	entries, _ := os.ReadDir(a.customerDirectory)
	for _, entry := range entries {
		stem := strings.TrimSuffix(strings.TrimSuffix(entry.Name(), ".part"), ".zip")
		if !exportID.MatchString(stem) {
			continue
		}
		j := a.state.CustomerExports[stem]
		if j == nil || !j.ExpiresAt.After(a.now()) {
			_ = os.Remove(filepath.Join(a.customerDirectory, entry.Name()))
		}
	}
	var job *CustomerExport
	for _, j := range a.state.CustomerExports {
		if j.Status == "queued" && j.ExpiresAt.After(a.now()) && (job == nil || j.CreatedAt.Before(job.CreatedAt)) {
			job = j
		}
	}
	if job == nil {
		a.mu.Unlock()
		return false, nil
	}
	snapshot, e := a.customerSnapshot(job.Org)
	if e != nil {
		_ = a.transact(func() { job.Status = "failed"; job.Error = "export_snapshot_unavailable" })
		a.mu.Unlock()
		return true, e
	}
	attempt := token()
	if e = a.transact(func() {
		job.Status = "running"
		job.Attempt = attempt
		job.CapturedAt = snapshot.CapturedAt
		a.metricStart("data", job.Org, job.ID, attempt, "customer_export", "preparation")
		a.record(AuditEntry{Org: job.Org, Actor: "data-worker", Action: "customer.export.started", Operation: job.ID})
	}); e != nil {
		a.mu.Unlock()
		return true, e
	}
	id, org := job.ID, job.Org
	a.mu.Unlock()
	// Metrics use their own collection timestamp, exposed in the manifest.
	if usage, err := a.customerUsage(ctx, org, 90); err == nil {
		b, _ := json.Marshal(usage)
		snapshot.Records = append(snapshot.Records, dataworker.Record{ID: "worker-usage", Collection: "worker_usage", At: usage.GeneratedAt, Data: b})
		snapshot.Coverage["worker_usage"] = "Included; collected asynchronously. See generated_at, collected_since and limited."
	} else {
		snapshot.Coverage["worker_usage"] = "Unavailable at export time; other customer data is included. This is not a complete metrics export."
	}
	path := filepath.Join(a.customerDirectory, id+".zip")
	partial := path + ".part"
	_ = os.Remove(partial)
	f, e := os.OpenFile(partial, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	var result dataworker.Result
	h := sha256.New()
	if e == nil {
		result, e = dataworker.Build(ctx, io.MultiWriter(f, h), snapshot, func(ctx context.Context, file dataworker.File) ([]byte, error) {
			if e := ctx.Err(); e != nil {
				return nil, e
			}
			a.mu.Lock()
			defer a.mu.Unlock()
			asset := a.state.Media.Assets[file.AssetID]
			if asset == nil || asset.Organization != org || !asset.Expires.After(a.now()) {
				return nil, dataworker.ErrFileUnavailable
			}
			b, err := a.readMediaBlob(file.ID, org)
			if err != nil {
				return nil, dataworker.ErrFileUnavailable
			}
			return b, nil
		})
		if e == nil {
			e = f.Sync()
		}
		closeErr := f.Close()
		if e == nil {
			e = closeErr
		}
	}
	var size int64
	if e == nil {
		var info os.FileInfo
		info, e = os.Stat(partial)
		if e == nil {
			size = info.Size()
			e = os.Rename(partial, path)
			if e == nil {
				directory, err := os.Open(a.customerDirectory)
				if err != nil {
					e = err
				} else {
					e = directory.Sync()
					_ = directory.Close()
				}
			}
		}
	}
	if e != nil {
		_ = os.Remove(partial)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	job = a.state.CustomerExports[id]
	if job == nil || job.Attempt != attempt {
		return true, errors.New("export_stale")
	}
	buildErr := e
	e = a.transact(func() {
		if buildErr != nil {
			job.Status = "failed"
			job.Error = "export_build_failed"
			a.metricEnd("data", org, id, attempt, "failed")
		} else {
			job.Status = "ready"
			job.Bytes = size
			job.SHA256 = hex.EncodeToString(h.Sum(nil))
			job.Result = result
			a.metricEnd("data", org, id, attempt, "completed")
		}
		a.record(AuditEntry{Org: org, Actor: "data-worker", Action: "customer.export." + job.Status, Operation: id})
	})
	if e != nil {
		return true, e
	}
	return true, buildErr
}
func (a *App) runDataWorker(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			workCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
			_, _ = a.dataExportOnce(workCtx)
			cancel()
		}
	}
}
