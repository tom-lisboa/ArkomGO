package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sdr-next-pilot/pkg/sdrsdk"
	"sort"
	"strings"
	"time"
)

type MessageMedia struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	MIME   string `json:"mime"`
	Name   string `json:"name"`
	Size   int    `json:"size"`
	Status string `json:"status"`
}
type MediaAsset struct {
	ID           string           `json:"id"`
	Organization string           `json:"organization_id"`
	Conversation string           `json:"conversation_id"`
	Direction    string           `json:"direction"`
	File         sdrsdk.MediaFile `json:"file"`
	Status       string           `json:"status"`
	Error        string           `json:"error,omitempty"`
	Created      time.Time        `json:"created_at"`
	Expires      time.Time        `json:"expires_at"`
}
type mediaTask struct {
	ID, Org, Conversation, Message, Direction, SourceID, Epoch, Target, Status, Lease, ResultDigest string
	File                                                                                            sdrsdk.MediaFile
	Created, LeaseUntil, NextAt                                                                     time.Time
	Attempts                                                                                        int
}
type MediaState struct {
	Assets map[string]*MediaAsset
	Jobs   map[string]*mediaTask
	Hourly map[string]int
}
type mediaSource interface {
	ReadInboxMedia(context.Context, string, string) ([]byte, error)
}

func (a *App) initMedia() error {
	if a.state.Media.Assets == nil {
		a.state.Media.Assets = map[string]*MediaAsset{}
	}
	if a.state.Media.Jobs == nil {
		a.state.Media.Jobs = map[string]*mediaTask{}
	}
	if a.state.Media.Hourly == nil {
		a.state.Media.Hourly = map[string]int{}
	}
	a.mediaBlobs = map[string][]byte{}
	a.mediaUploadSlots = make(chan struct{}, 1)
	a.mediaDownloadSlots = make(chan struct{}, 2)
	if a.db == nil {
		return nil
	}
	_, e := a.db.Exec(`CREATE TABLE IF NOT EXISTS media_blobs(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,sha256 TEXT NOT NULL,payload BLOB NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS media_blob_org ON media_blobs(organization_id);`)
	return e
}
func (a *App) putMediaBlob(id, org string, b []byte, expires time.Time) error {
	if len(b) == 0 || len(b) > sdrsdk.MaxMediaBytes {
		return errors.New("media_size_invalid")
	}
	hash := fmt.Sprintf("%x", sha256.Sum256(b))
	if a.db == nil {
		if old, ok := a.mediaBlobs[id]; ok && fmt.Sprintf("%x", sha256.Sum256(old)) != hash {
			return errors.New("media_immutable")
		}
		a.mediaBlobs[id] = append([]byte(nil), b...)
		return nil
	}
	_, _ = a.db.Exec("DELETE FROM media_blobs WHERE expires_at<?", a.now().Unix())
	var current string
	e := a.db.QueryRow("SELECT sha256 FROM media_blobs WHERE id=? AND organization_id=?", id, org).Scan(&current)
	if e == nil {
		if current != hash {
			return errors.New("media_immutable")
		}
		return nil
	}
	if !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	var size, count int
	if e = a.db.QueryRow("SELECT coalesce(sum(length(payload)),0),count(*) FROM media_blobs WHERE organization_id=?", org).Scan(&size, &count); e != nil {
		return e
	}
	if size+len(b) > 256<<20 || count >= 500 {
		return errors.New("media_quota_exceeded")
	}
	_, e = a.db.Exec("INSERT INTO media_blobs VALUES(?,?,?,?,?)", id, org, hash, b, expires.Unix())
	return e
}
func (a *App) readMediaBlob(id, org string) ([]byte, error) {
	if a.db == nil {
		b, ok := a.mediaBlobs[id]
		if !ok {
			return nil, errors.New("media_not_found")
		}
		return append([]byte(nil), b...), nil
	}
	var b []byte
	e := a.db.QueryRow("SELECT payload FROM media_blobs WHERE id=? AND organization_id=? AND expires_at>?", id, org, a.now().Unix()).Scan(&b)
	return b, e
}
func (a *App) mediaRoute(w http.ResponseWriter, r *http.Request, u User, path string) bool {
	if path == "v1/sdr/media" && r.Method == "POST" {
		a.uploadMedia(w, r, u, nil)
		return true
	}
	if a.mediaMessageRoute(w, r, u, path) {
		return true
	}
	parts := strings.Split(path, "/")
	if len(parts) == 5 && parts[0] == "v1" && parts[1] == "sdr" && parts[2] == "conversations" && parts[4] == "media" && r.Method == "POST" {
		c := a.state.Conversations[parts[3]]
		if c == nil || c.Org != u.Org {
			fail(w, 404, "not_found")
			return true
		}
		a.uploadMedia(w, r, u, c)
		return true
	}
	if len(parts) >= 4 && parts[0] == "v1" && parts[1] == "sdr" && parts[2] == "media" {
		asset := a.state.Media.Assets[parts[3]]
		if asset == nil || asset.Organization != u.Org {
			fail(w, 404, "not_found")
			return true
		}
		if r.Method == "GET" && len(parts) == 4 {
			write(w, 200, asset)
			return true
		}
		if r.Method == "GET" && len(parts) == 5 && parts[4] == "content" {
			if !asset.Expires.After(a.now()) {
				fail(w, 410, "media_expired")
				return true
			}
			if asset.Status != "ready" && asset.Direction != "inbound" {
				fail(w, 409, "media_not_ready")
				return true
			}
			select {
			case a.mediaDownloadSlots <- struct{}{}:
				defer func() { <-a.mediaDownloadSlots }()
			default:
				fail(w, 429, "media_download_busy")
				return true
			}
			b, e := a.readMediaBlob(asset.ID, u.Org)
			if e != nil {
				fail(w, 404, "not_found")
				return true
			}
			a.mu.Unlock()
			sendMediaBytes(w, b, asset.File.MIME)
			a.mu.Lock()
			return true
		}
		fail(w, 404, "not_found")
		return true
	}
	return false
}
func sendMediaBytes(w http.ResponseWriter, b []byte, contentType string) {
	w.Header().Set("Content-Type", sdrsdk.MediaContentType(contentType))
	w.Header().Set("Content-Disposition", "attachment")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", fmt.Sprint(len(b)))
	_, _ = w.Write(b)
}
func (a *App) uploadMedia(w http.ResponseWriter, r *http.Request, u User, c *Conversation) {
	if u.Role == "viewer" {
		fail(w, 403, "forbidden")
		return
	}
	if !a.mediaEnabled {
		fail(w, 409, "media_not_configured")
		return
	}
	if c != nil && (c.OptedOut || c.Automation == "active") {
		fail(w, 409, "human_control_required")
		return
	}
	if c != nil && c.Channel == "whatsapp" && !a.state.Transport.Policies[u.Org].MediaEnabled {
		fail(w, 409, "media_not_enabled")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" || len(key) > 100 {
		fail(w, 422, "validation_error")
		return
	}
	parsed, ok := r.Context().Value(mediaUploadKey{}).(*parsedMediaUpload)
	if !ok {
		fail(w, 422, "media_invalid")
		return
	}
	data, info := parsed.Data, parsed.File
	conversation := ""
	if c != nil {
		conversation = c.ID
	}
	var e error
	fingerprint := sdrsdk.Digest(struct {
		Conversation string
		File         sdrsdk.MediaFile
	}{conversation, info})
	rk := "media-upload:" + u.Org + ":" + u.ID + ":" + key
	if a.replay(w, rk, fingerprint) {
		return
	}
	hour := u.Org + ":" + a.now().UTC().Format("2006010215")
	if a.state.Media.Hourly[hour] >= 30 || len(a.state.Media.Assets) >= 1000 {
		fail(w, 429, "media_limit")
		return
	}
	id := token()
	now := a.now().UTC()
	asset := &MediaAsset{ID: id, Organization: u.Org, Conversation: conversation, Direction: "outbound", File: info, Status: "pending", Created: now, Expires: now.Add(7 * 24 * time.Hour)}
	if e = a.putMediaBlob(id+"_raw", u.Org, data, asset.Expires); e != nil {
		fail(w, 503, "media_storage_unavailable")
		return
	}
	result := map[string]any{"asset": asset, "duplicate": false}
	e = a.transact(func() {
		a.state.Media.Assets[id] = asset
		a.state.Media.Jobs[id] = &mediaTask{ID: id, Org: u.Org, Conversation: conversation, Direction: "outbound", Status: "pending", File: info, Created: now}
		a.state.Media.Hourly[hour]++
		raw, _ := json.Marshal(result)
		a.state.Results[rk] = resultType(fingerprint, raw, 202)
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "media.uploaded", Conversation: conversation, Operation: id})
	})
	if e != nil {
		fail(w, 503, "storage_unavailable")
		return
	}
	write(w, 202, result)
}
func resultType(fp string, b json.RawMessage, code int) result { return result{fp, b, code} }
func (a *App) mediaJobAllowed(j *mediaTask) bool {
	if j == nil {
		return false
	}
	asset := a.state.Media.Assets[j.ID]
	if asset == nil || !asset.Expires.After(a.now()) {
		return false
	}
	if j.Direction == "outbound" && j.Conversation == "" {
		return a.mediaEnabled && asset.Organization == j.Org && asset.Conversation == "" && asset.Direction == "outbound"
	}
	if c := a.state.Conversations[j.Conversation]; c == nil || c.OptedOut {
		return false
	}
	if j.Direction == "outbound" {
		return true
	}
	p := a.state.Transport.Policies[j.Org]
	return a.mediaEnabled && p.MediaEnabled && allowsReal(p, j.Epoch, j.Target)
}
func (a *App) mediaLease(j *mediaTask, lease string) bool {
	return j != nil && j.Status == "running" && j.Lease == lease && j.LeaseUntil.After(a.now()) && a.mediaJobAllowed(j)
}
func (a *App) mediaPrivate(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/internal/workers/media/") {
		return false
	}
	if !a.mediaEnabled || !a.pipelineEnabled || r.Method != "POST" {
		fail(w, 404, "not_found")
		return true
	}
	a.mu.Lock()
	expected, ok := a.workerSecrets["media"]
	actual := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	if !ok || subtle.ConstantTimeCompare(expected[:], actual[:]) != 1 {
		a.mu.Unlock()
		fail(w, 401, "unauthorized")
		return true
	}
	var body struct {
		ID     string             `json:"id"`
		Lease  string             `json:"lease"`
		Code   string             `json:"code"`
		Result sdrsdk.MediaResult `json:"result"`
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 12<<20))
	d.DisallowUnknownFields()
	if d.Decode(&body) != nil || d.Decode(new(any)) != io.EOF {
		a.mu.Unlock()
		fail(w, 400, "invalid_json")
		return true
	}
	a.workerHealth["media"] = WorkerHealth{At: a.now().UTC(), Model: "media"}
	action := strings.TrimPrefix(r.URL.Path, "/internal/workers/media/")
	if action == "claim" {
		a.claimMedia(w)
		a.mu.Unlock()
		return true
	}
	j := a.state.Media.Jobs[body.ID]
	if action == "complete" && j != nil && j.Status == "ready" && j.Lease == body.Lease && j.ResultDigest == sdrsdk.Digest(body.Result) {
		a.mu.Unlock()
		write(w, 200, map[string]bool{"accepted": true})
		return true
	}
	if !a.mediaLease(j, body.Lease) {
		a.mu.Unlock()
		fail(w, 409, "media_stale")
		return true
	}
	if action == "read" {
		snap := *j
		blobID := j.ID
		if j.Direction == "outbound" {
			blobID += "_raw"
		}
		data, e := a.readMediaBlob(blobID, j.Org)
		if e == nil {
			a.mu.Unlock()
			sendMediaBytes(w, data, j.File.MIME)
			return true
		}
		source, exists := a.wa.(mediaSource)
		a.mu.Unlock()
		if !exists || snap.SourceID == "" {
			fail(w, 503, "media_unavailable")
			return true
		}
		data, e = source.ReadInboxMedia(r.Context(), snap.Org, snap.SourceID)
		if e != nil {
			if errors.Is(e, sdrsdk.ErrMediaPending) {
				fail(w, 425, "media_preparing")
				return true
			}
			fail(w, 503, "media_unavailable")
			return true
		}
		info, e := sdrsdk.InspectMedia(data, snap.File.Name)
		a.mu.Lock()
		defer a.mu.Unlock()
		j = a.state.Media.Jobs[body.ID]
		if e != nil || info.Kind != snap.File.Kind || (snap.File.SHA256 != "" && info.SHA256 != snap.File.SHA256) || !a.mediaLease(j, body.Lease) {
			fail(w, 409, "media_stale")
			return true
		}
		asset := a.state.Media.Assets[j.ID]
		if a.putMediaBlob(j.ID, j.Org, data, asset.Expires) != nil {
			fail(w, 503, "media_storage_unavailable")
			return true
		}
		if a.transact(func() { asset.File = info; j.File = info }) != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		sendMediaBytes(w, data, info.MIME)
		return true
	}
	defer a.mu.Unlock()
	if action == "fail" {
		if a.transact(func() {
			outcome := "failed"
			if body.Code == "media_waiting_download" {
				outcome = "waiting_download"
			}
			a.metricEnd("media", j.Org, j.ID, j.Lease, outcome)
			if body.Code == "media_waiting_download" && a.now().Sub(j.Created) < 120*time.Second {
				j.Status = "pending"
				j.NextAt = a.now().Add(2 * time.Second)
				j.Attempts--
				a.state.Media.Assets[j.ID].Status = "pending"
			} else if j.Attempts < 2 && a.now().Sub(j.Created) < 90*time.Second && a.mediaJobAllowed(j) {
				j.Status = "pending"
				j.NextAt = a.now().Add(3 * time.Second)
				a.state.Media.Assets[j.ID].Status = "pending"
			} else {
				a.mediaFailed(j, "media_processing_failed")
			}
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return true
		}
		write(w, 200, map[string]bool{"accepted": true})
		return true
	}
	if action != "complete" {
		fail(w, 404, "not_found")
		return true
	}
	if err := a.finishMedia(j, body.Result); err != nil {
		code := 503
		if errors.Is(err, errMediaResult) {
			code = 422
		}
		fail(w, code, "media_result_invalid")
		return true
	}
	write(w, 200, map[string]bool{"accepted": true})
	return true
}
func (a *App) claimMedia(w http.ResponseWriter) {
	now := a.now().UTC()
	list := []*mediaTask{}
	for _, j := range a.state.Media.Jobs {
		if (j.Status == "pending" && !j.NextAt.After(now)) || (j.Status == "running" && !j.LeaseUntil.After(now)) {
			list = append(list, j)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Created.Before(list[j].Created) })
	for _, j := range list {
		if !a.mediaJobAllowed(j) || now.Sub(j.Created) > 120*time.Second || j.Attempts >= 2 {
			if a.transact(func() { a.mediaFailed(j, "media_expired") }) != nil {
				fail(w, 503, "storage_unavailable")
				return
			}
			continue
		}
		if a.transact(func() {
			if j.Status == "running" {
				a.metricEnd("media", j.Org, j.ID, j.Lease, "expired")
			}
			j.Status = "running"
			j.Lease = token()
			j.LeaseUntil = now.Add(85 * time.Second)
			j.Attempts++
			a.metricStart("media", j.Org, j.ID, j.Lease, j.Direction+":"+j.File.Kind, a.metricMode(j.Conversation))
			a.state.Media.Assets[j.ID].Status = "processing"
		}) != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		write(w, 200, sdrsdk.MediaJob{ID: j.ID, Lease: j.Lease, Organization: j.Org, Conversation: j.Conversation, Message: j.Message, Direction: j.Direction, File: j.File})
		return
	}
	w.WriteHeader(204)
}
func (a *App) mediaFailed(j *mediaTask, code string) {
	a.metricEnd("media", j.Org, j.ID, j.Lease, "failed")
	j.Status = "failed"
	asset := a.state.Media.Assets[j.ID]
	if asset != nil {
		asset.Status = "failed"
		asset.Error = code
	}
	c := a.state.Conversations[j.Conversation]
	if c != nil && j.Direction == "inbound" {
		for i := range a.state.Messages[c.ID] {
			m := &a.state.Messages[c.ID][i]
			if m.ID == j.Message && m.Media != nil {
				m.Media.Status = "failed"
				caption := m.Text
				m.Text = "[Mídia não interpretada; requer conferência da equipe]"
				if caption != "" && !strings.HasPrefix(caption, "[Mídia") {
					m.Text += "\nLegenda: " + caption
				}
				a.event(c, "message.updated", m.ID)
			}
		}
		a.state.Generation[c.ID]++
		a.invalidatePipeline(c, false)
		a.cancelOldAutomatic(c)
		if c.Automation == "active" {
			c.Automation = "human"
		}
		a.touch(c)
	}
	a.record(AuditEntry{Org: j.Org, Actor: "media-worker", Action: "media.failed", Conversation: j.Conversation, Operation: j.ID, Reason: code})
}

var errMediaResult = errors.New("media_result_invalid")

func (a *App) finishMedia(j *mediaTask, v sdrsdk.MediaResult) error {
	asset := a.state.Media.Assets[j.ID]
	if j.Direction == "outbound" {
		f, e := sdrsdk.InspectMedia(v.Data, v.File.Name)
		if e != nil || f != v.File || f.Kind != j.File.Kind {
			return errMediaResult
		}
		if e = a.putMediaBlob(j.ID, j.Org, v.Data, asset.Expires); e != nil {
			return e
		}
	} else if strings.TrimSpace(v.Text) == "" || len(v.Text) > 16000 || len(v.Data) > 0 || v.File != j.File {
		return errMediaResult
	}
	e := a.transact(func() {
		a.metricEnd("media", j.Org, j.ID, j.Lease, "completed")
		j.Status = "ready"
		j.ResultDigest = sdrsdk.Digest(v)
		asset.Status = "ready"
		asset.File = v.File
		if j.Direction == "inbound" {
			c := a.state.Conversations[j.Conversation]
			if c != nil {
				for i := range a.state.Messages[c.ID] {
					m := &a.state.Messages[c.ID][i]
					if m.ID == j.Message && m.Media != nil {
						caption := strings.TrimSpace(m.Text)
						m.Text = "[" + j.File.Kind + " · conteúdo interpretado]\n" + strings.TrimSpace(v.Text)
						if caption != "" && !strings.HasPrefix(caption, "[Mídia") {
							m.Text += "\nLegenda: " + caption
						}
						m.Media.Status = "ready"
						m.Media.Name = v.File.Name
						m.Media.MIME = v.File.MIME
						m.Media.Size = v.File.Size
						a.event(c, "message.updated", m.ID)
						if pipelineOptOut(v.Text) {
							c.OptedOut = true
							c.Automation = "paused"
							a.state.Generation[c.ID]++
							a.invalidatePipeline(c, false)
							a.cancelOldAutomatic(c)
							a.touch(c)
						}
					}
				}
				if window := a.state.Pipeline.Windows[c.ID]; window != nil && window.Status == "pending" {
					settle := a.now().Add(3 * time.Second)
					if window.DueAt.Before(settle) {
						window.DueAt = settle
					}
				}
			}
		}
		a.record(AuditEntry{Org: j.Org, Actor: "media-worker", Action: "media.prepared", Conversation: j.Conversation, Operation: j.ID})
	})
	if e == nil && j.Direction == "outbound" {
		if a.db != nil {
			_, _ = a.db.Exec("DELETE FROM media_blobs WHERE id=? AND organization_id=?", j.ID+"_raw", j.Org)
		} else {
			delete(a.mediaBlobs, j.ID+"_raw")
		}
	}
	return e
}
func (e *engineClient) ReadInboxMedia(ctx context.Context, org, id string) ([]byte, error) {
	r, err := http.NewRequestWithContext(ctx, "GET", e.base+"/internal/accounts/"+url.PathEscape(org)+"/inbox/"+url.PathEscape(id)+"/media", nil)
	if err != nil {
		return nil, err
	}
	r.Header.Set("Authorization", "Bearer "+e.secret)
	res, err := e.http.Do(r)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode == 425 {
		return nil, sdrsdk.ErrMediaPending
	}
	if res.StatusCode != 200 {
		return nil, errors.New("media_unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, sdrsdk.MaxMediaBytes+1))
	if err != nil || len(data) > sdrsdk.MaxMediaBytes {
		return nil, errors.New("media_size_invalid")
	}
	return data, nil
}

func (a *App) incomingMedia(c *Conversation, messageID string, v realInbound) {
	id := token()
	now := a.now().UTC()
	file := *v.Media
	asset := &MediaAsset{ID: id, Organization: c.Org, Conversation: c.ID, Direction: "inbound", File: file, Status: "pending", Created: now, Expires: now.Add(7 * 24 * time.Hour)}
	job := &mediaTask{ID: id, Org: c.Org, Conversation: c.ID, Message: messageID, Direction: "inbound", SourceID: v.ID, Epoch: v.Epoch, Target: v.Target, File: file, Status: "pending", Created: now}
	a.state.Media.Assets[id] = asset
	a.state.Media.Jobs[id] = job
	for i := range a.state.Messages[c.ID] {
		m := &a.state.Messages[c.ID][i]
		if m.ID == messageID {
			m.Media = &MessageMedia{ID: id, Kind: file.Kind, MIME: file.MIME, Name: file.Name, Size: file.Size, Status: "pending"}
		}
	}
	hour := c.Org + ":" + now.Format("2006010215")
	a.state.Media.Hourly[hour]++
	if file.Size > sdrsdk.MaxMediaBytes || file.Size < 0 || !(file.Kind == "audio" || file.Kind == "image" || file.Kind == "document") || a.state.Media.Hourly[hour] > 30 || c.OptedOut {
		a.mediaFailed(job, "media_limit_or_type")
		return
	}
	if window := a.state.Pipeline.Windows[c.ID]; window != nil && window.Status == "pending" {
		window.DueAt = a.mediaWindowDue(c, window)
	}
}
func (a *App) mediaWindowDue(c *Conversation, w *ContextWindow) time.Time {
	due := sdrsdk.DefaultPolicy().Due(w.FirstAt, w.LastAt)
	for _, m := range a.state.Messages[c.ID] {
		if m.Media != nil && m.Direction == "inbound" && containsID(w.InputIDs, m.ID) {
			due = w.LastAt.Add(12 * time.Second)
			max := w.FirstAt.Add(30 * time.Second)
			if due.After(max) {
				due = max
			}
			break
		}
	}
	return due
}
func containsID(ids []string, id string) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}
func (a *App) mediaWindowPending(w *ContextWindow) bool {
	for _, m := range a.state.Messages[w.Conversation] {
		if containsID(w.InputIDs, m.ID) && m.Media != nil && m.Media.Status != "ready" {
			return true
		}
	}
	return false
}
func (a *App) expireMediaTasks() bool {
	list := []*mediaTask{}
	for _, j := range a.state.Media.Jobs {
		if (j.Status == "pending" || j.Status == "running") && a.now().Sub(j.Created) > 120*time.Second {
			list = append(list, j)
		}
	}
	if len(list) == 0 {
		return true
	}
	return a.transact(func() {
		for _, j := range list {
			a.mediaFailed(j, "media_timeout")
		}
	}) == nil
}
func (a *App) usableOutgoingMedia(u User, c *Conversation, id string) bool {
	asset := a.state.Media.Assets[id]
	return a.mediaEnabled && asset != nil && asset.Organization == u.Org && (asset.Conversation == "" || asset.Conversation == c.ID) && asset.Direction == "outbound" && asset.Status == "ready" && asset.Expires.After(a.now()) && (c.Channel != "whatsapp" || a.state.Transport.Policies[u.Org].MediaEnabled)
}
func (a *App) addEnvelopeMedia(e *realEnvelope, m *Message) {
	if m.Media == nil {
		return
	}
	asset := a.state.Media.Assets[m.Media.ID]
	if asset == nil {
		return
	}
	e.MediaSeconds = asset.File.Seconds
	e.MediaID = asset.ID
	e.MediaKind = asset.File.Kind
	e.MediaMIME = asset.File.MIME
	e.MediaName = asset.File.Name
	e.MediaSize = asset.File.Size
	e.MediaSHA256 = asset.File.SHA256
}
func (a *App) envelopeMediaAllowed(e realEnvelope) bool {
	if e.MediaID == "" {
		return e.MediaKind == "" && e.MediaSHA256 == "" && e.MediaMIME == "" && e.MediaName == "" && e.MediaSize == 0 && e.MediaSeconds == 0
	}
	asset := a.state.Media.Assets[e.MediaID]
	if !a.mediaEnabled || !a.state.Transport.Policies[e.Organization].MediaEnabled || asset == nil || asset.Organization != e.Organization || (asset.Conversation != "" && asset.Conversation != e.Conversation) || asset.Direction != "outbound" || asset.Status != "ready" || !asset.Expires.After(a.now()) {
		return false
	}
	return asset.File.Seconds == e.MediaSeconds && asset.File.Kind == e.MediaKind && asset.File.MIME == e.MediaMIME && asset.File.Name == e.MediaName && asset.File.Size == e.MediaSize && asset.File.SHA256 == e.MediaSHA256
}
func (a *App) transportMediaBytes(w http.ResponseWriter, r *http.Request) {
	engine, ok := a.wa.(*engineClient)
	if !ok || len(engine.secret) < 40 || subtle.ConstantTimeCompare([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")), []byte(engine.secret)) != 1 {
		fail(w, 401, "unauthorized")
		return
	}
	var b struct {
		Envelope realEnvelope `json:"envelope"`
		Claim    string       `json:"claim"`
	}
	if !decodeCore(w, r, &b) {
		return
	}
	d := a.state.Transport.Deliveries[b.Envelope.ID]
	if d == nil || d.Envelope != b.Envelope || d.Status != "queued" || !transportID.MatchString(b.Claim) || b.Envelope.MediaID == "" || !a.realEligible(d) {
		fail(w, 409, "dispatch_not_permitted")
		return
	}
	data, e := a.readMediaBlob(b.Envelope.MediaID, b.Envelope.Organization)
	if e != nil || fmt.Sprintf("%x", sha256.Sum256(data)) != b.Envelope.MediaSHA256 || len(data) != b.Envelope.MediaSize {
		fail(w, 409, "media_unavailable")
		return
	}
	sendMediaBytes(w, data, b.Envelope.MediaMIME)
}

// Upload bodies are read outside App.mu so a slow upload cannot block pauses,
// worker claims or other companies' requests. Recheck the session in serve.
type mediaUploadKey struct{}
type parsedMediaUpload struct {
	Data []byte
	File sdrsdk.MediaFile
}

func (a *App) prepareMediaUpload(w http.ResponseWriter, r *http.Request) bool {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	library := len(parts) == 3 && parts[0] == "v1" && parts[1] == "sdr" && parts[2] == "media"
	conversation := len(parts) == 5 && parts[0] == "v1" && parts[1] == "sdr" && parts[2] == "conversations" && parts[4] == "media"
	if r.Method != "POST" || (!library && !conversation) {
		return false
	}
	if !pilotCORS(w, r) {
		return true
	}
	a.mu.Lock()
	tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))))
	session, ok := a.sessions[tokenHash]
	if !ok || !session.Expires.After(a.now()) {
		a.mu.Unlock()
		fail(w, 401, "unauthorized")
		return true
	}
	u, directoryErr := a.directoryUser(r.Context(), session.User)
	if directoryErr != nil {
		a.mu.Unlock()
		directoryFailure(w, directoryErr)
		return true
	}
	session.User = u
	if session.User.Role == "viewer" {
		a.mu.Unlock()
		fail(w, 403, "forbidden")
		return true
	}
	if !a.mediaEnabled {
		a.mu.Unlock()
		fail(w, 409, "media_not_configured")
		return true
	}
	if !a.allow(w, r, []quota{{"media-upload:" + session.User.Org + ":" + session.User.ID, 10, 10 * time.Minute}}) {
		a.mu.Unlock()
		return true
	}
	slots := a.mediaUploadSlots
	a.mu.Unlock()
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	default:
		fail(w, 429, "media_upload_busy")
		return true
	}
	r.Body = http.MaxBytesReader(w, r.Body, sdrsdk.MaxMediaBytes+(64<<10))
	mr, e := r.MultipartReader()
	if e != nil {
		fail(w, 422, "media_invalid")
		return true
	}
	part, e := mr.NextPart()
	if e != nil || part.FormName() != "file" || part.FileName() == "" {
		fail(w, 422, "media_invalid")
		return true
	}
	b, e := io.ReadAll(io.LimitReader(part, sdrsdk.MaxMediaBytes+1))
	if e != nil {
		fail(w, 422, "media_invalid")
		return true
	}
	info, e := sdrsdk.InspectMedia(b, part.FileName())
	if e != nil {
		fail(w, 422, "media_invalid")
		return true
	}
	if _, e = mr.NextPart(); e != io.EOF {
		fail(w, 422, "media_invalid")
		return true
	}
	a.serve(w, r.WithContext(context.WithValue(r.Context(), mediaUploadKey{}, &parsedMediaUpload{b, info})))
	return true
}
