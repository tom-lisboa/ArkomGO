package main

import (
	"crypto/sha256"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"time"
)

type AuditEntry struct {
	ID           string `json:"id"`
	Org          string `json:"organization_id"`
	Actor        string `json:"actor_id"`
	Action       string `json:"action"`
	Conversation string `json:"conversation_id"`
	Operation    string `json:"operation_id"`
	Revision     int    `json:"revision"`
	Reason       string `json:"reason"`
	At           string `json:"at"`
}

func (a *App) record(entry AuditEntry) {
	entry.ID = token()
	entry.At = a.now().UTC().Format(time.RFC3339Nano)
	a.state.Audit = append(a.state.Audit, entry)
}
func (a *App) authAudit(w http.ResponseWriter, username, action string) bool {
	u, ok := a.users[username]
	if !ok {
		u = User{ID: "unknown-user", Org: "__lab__"}
	}
	if err := a.transact(func() { a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: action}) }); err != nil {
		fail(w, 503, "storage_unavailable")
		return false
	}
	return true
}
func (a *App) deniedAudit(w http.ResponseWriter, u User, action string) bool {
	if err := a.transact(func() { a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: action}) }); err != nil {
		fail(w, 503, "storage_unavailable")
		return false
	}
	return true
}
func (a *App) listAudit(w http.ResponseWriter, r *http.Request, u User) {
	if u.Role != "admin" {
		if !a.deniedAudit(w, u, "audit.denied") {
			return
		}
		fail(w, 403, "forbidden")
		return
	}
	after := int64(0)
	limit := 50
	var err error
	if raw := r.URL.Query().Get("after_seq"); raw != "" {
		after, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || after < 0 {
			fail(w, 422, "validation_error")
			return
		}
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			fail(w, 422, "validation_error")
			return
		}
	}
	type row struct {
		Sequence int64 `json:"sequence"`
		AuditEntry
	}
	items := []row{}
	next := after
	if a.db != nil {
		rows, err := a.db.Query(`SELECT seq,id,organization_id,actor_id,action,conversation_id,operation_id,revision,reason,at FROM audit WHERE organization_id=? AND seq>? ORDER BY seq LIMIT ?`, u.Org, after, limit+1)
		if err != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var v row
			if err = rows.Scan(&v.Sequence, &v.ID, &v.Org, &v.Actor, &v.Action, &v.Conversation, &v.Operation, &v.Revision, &v.Reason, &v.At); err != nil {
				fail(w, 503, "storage_unavailable")
				return
			}
			items = append(items, v)
		}
		if rows.Err() != nil {
			fail(w, 503, "storage_unavailable")
			return
		}
	} else {
		for i, v := range a.state.Audit {
			seq := int64(i + 1)
			if seq > after && v.Org == u.Org {
				items = append(items, row{seq, v})
				if len(items) > limit {
					break
				}
			}
		}
	}
	more := len(items) > limit
	if more {
		items = items[:limit]
	}
	if len(items) > 0 {
		next = items[len(items)-1].Sequence
	}
	write(w, 200, map[string]any{"items": items, "next_after_seq": next, "has_more": more})
}

type limitWindow struct {
	Start int64
	Used  int
}
type quota struct {
	Key    string
	Max    int
	Window time.Duration
}

func remoteIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "unknown-peer"
	}
	return ip
}

// Request limits are persisted separately from business state. Rejected traffic
// does not touch conversations. Forwarded headers are never used for identity.
func (a *App) allow(w http.ResponseWriter, r *http.Request, quotas []quota) bool {
	now := a.now().Unix()
	retry := 0
	if a.db == nil {
		for _, q := range quotas {
			key := fmt.Sprintf("%x", sha256.Sum256([]byte(q.Key)))
			v := a.memoryLimits[key]
			seconds := int64(q.Window / time.Second)
			if v.Start == 0 || now-v.Start >= seconds {
				v = limitWindow{Start: now}
			}
			if v.Used >= q.Max {
				retry = max(retry, int(v.Start+seconds-now))
				continue
			}
			v.Used++
			a.memoryLimits[key] = v
		}
	} else {
		tx, err := a.db.Begin()
		if err != nil {
			fail(w, 503, "storage_unavailable")
			return false
		}
		defer tx.Rollback()
		// All configured windows are at most fifteen minutes; expired buckets are safe to discard.
		if _, err = tx.Exec("DELETE FROM request_limits WHERE started_at < ?", now-3600); err != nil {
			fail(w, 503, "storage_unavailable")
			return false
		}
		for _, q := range quotas {
			key := fmt.Sprintf("%x", sha256.Sum256([]byte(q.Key)))
			seconds := int64(q.Window / time.Second)
			_, err = tx.Exec(`INSERT INTO request_limits(key,started_at,used) VALUES(?,?,0) ON CONFLICT(key) DO UPDATE SET started_at=CASE WHEN ?-started_at>=? THEN ? ELSE started_at END,used=CASE WHEN ?-started_at>=? THEN 0 ELSE used END`, key, now, now, seconds, now, now, seconds)
			if err != nil {
				fail(w, 503, "storage_unavailable")
				return false
			}
			var start int64
			var used int
			if err = tx.QueryRow("SELECT started_at,used FROM request_limits WHERE key=?", key).Scan(&start, &used); err != nil {
				fail(w, 503, "storage_unavailable")
				return false
			}
			if used >= q.Max {
				retry = max(retry, int(start+seconds-now))
				continue
			}
			if _, err = tx.Exec("UPDATE request_limits SET used=used+1 WHERE key=?", key); err != nil {
				fail(w, 503, "storage_unavailable")
				return false
			}
		}
		if err = tx.Commit(); err != nil {
			fail(w, 503, "storage_unavailable")
			return false
		}
	}
	if retry > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		fail(w, 429, "rate_limited")
		return false
	}
	return true
}
