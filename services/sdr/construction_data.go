package main

import (
	"deeph/pkg/construction"
	"encoding/json"
	"errors"
	"time"
)

// One small document per authenticated company/application. Code revisions share
// the stable application namespace; the generated process never chooses it.
type previewDocument struct {
	Value     json.RawMessage `json:"value"`
	Version   int             `json:"version"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// Called under a.mu. Return a copy so the child cannot alias the working set.
func (a *App) previewData(org, appID string) (*construction.DataSnapshot, int) {
	if a.db == nil {
		return nil, 0
	}
	doc := a.state.Platform.PreviewData[org][appID]
	if doc == nil {
		return &construction.DataSnapshot{}, 0
	}
	return &construction.DataSnapshot{Found: true, Value: append(json.RawMessage(nil), doc.Value...)}, doc.Version
}

// The mutation and its audit receipt use the same existing SQLite transaction.
// A nil database must never be mistaken for durable storage.
func (a *App) savePreviewData(u User, appID string, expected int, value json.RawMessage) error {
	if a.db == nil || a.constructionClosed {
		return errors.New("preview_data_unavailable")
	}
	if !construction.ValidData(value) {
		return errors.New("preview_data_invalid")
	}
	_, version := a.previewData(u.Org, appID)
	if version != expected {
		return errors.New("preview_data_conflict")
	}
	if err := a.transact(func() {
		if a.state.Platform.PreviewData == nil {
			a.state.Platform.PreviewData = map[string]map[string]*previewDocument{}
		}
		if a.state.Platform.PreviewData[u.Org] == nil {
			a.state.Platform.PreviewData[u.Org] = map[string]*previewDocument{}
		}
		a.state.Platform.PreviewData[u.Org][appID] = &previewDocument{Value: append(json.RawMessage(nil), value...), Version: version + 1, UpdatedAt: a.now().UTC()}
		// Content is deliberately absent from audit entries and construction traces.
		a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "preview.data_saved", Operation: appID, Revision: version + 1})
	}); err != nil {
		return errors.New("preview_data_unavailable")
	}
	return nil
}
