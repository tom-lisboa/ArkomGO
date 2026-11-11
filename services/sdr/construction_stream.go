package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Called under a.mu only after the transaction commits. Listeners re-read
// persisted state; notification coalescing cannot lose an event.
func (a *App) signalConstruction() {
	if a.constructionChanged != nil {
		close(a.constructionChanged)
	}
	a.constructionChanged = make(chan struct{})
}

func (a *App) constructionStream(w http.ResponseWriter, r *http.Request, u User, id string) {
	cursor := 0
	raw := r.URL.Query().Get("after")
	if raw == "" {
		raw = r.Header.Get("Last-Event-ID")
	}
	if raw != "" {
		var err error
		cursor, err = strconv.Atoi(raw)
		if err != nil || cursor < 0 {
			fail(w, 400, "invalid_cursor")
			return
		}
	}
	a.mu.Lock()
	b := a.state.Platform.Constructions[id]
	if b == nil || b.Org != u.Org {
		a.mu.Unlock()
		fail(w, 404, "not_found")
		return
	}
	if a.constructionStreams == nil {
		a.constructionStreams = map[string]int{}
	}
	if a.constructionStreams[u.Org] >= 8 {
		a.mu.Unlock()
		fail(w, 429, "stream_limit")
		return
	}
	a.constructionStreams[u.Org]++
	a.mu.Unlock()
	defer func() { a.mu.Lock(); a.constructionStreams[u.Org]--; a.mu.Unlock() }()
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	controller := http.NewResponseController(w)
	send := func(kind string, seq int, payload []byte) error {
		_ = controller.SetWriteDeadline(time.Now().Add(15 * time.Second))
		if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", seq, kind, payload); err != nil {
			return err
		}
		return controller.Flush()
	}
	hash := sha256.Sum256([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")))
	key := hex.EncodeToString(hash[:])
	heartbeat := time.NewTicker(10 * time.Second)
	defer heartbeat.Stop()
	first := true
	for {
		a.mu.Lock()
		session, valid := a.sessions[key]
		if !valid || !session.Expires.After(a.now()) || session.User.Org != u.Org {
			a.mu.Unlock()
			_ = send("session.expired", cursor, []byte(`{"error":"unauthorized"}`))
			return
		}
		b = a.state.Platform.Constructions[id]
		if b == nil || b.Org != u.Org {
			a.mu.Unlock()
			return
		}
		if cursor > len(b.Traces) {
			cursor = 0
			first = true
		}
		seq := len(b.Traces)
		data := map[string]any{"build": b.summary(), "traces": b.Traces[cursor:]}
		kind := "update"
		if first {
			data["files"] = b.Files
			kind = "snapshot"
		}
		payload, _ := json.Marshal(data)
		terminal := b.Status != "running"
		if a.constructionChanged == nil {
			a.constructionChanged = make(chan struct{})
		}
		changed := a.constructionChanged
		a.mu.Unlock()
		if first || seq > cursor || terminal {
			if send(kind, seq, payload) != nil {
				return
			}
			cursor = seq
			first = false
		}
		if terminal {
			_ = send("end", cursor, []byte(`{}`))
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-changed:
		case <-heartbeat.C:
			_ = controller.SetWriteDeadline(time.Now().Add(15 * time.Second))
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			if controller.Flush() != nil {
				return
			}
		}
	}
}
