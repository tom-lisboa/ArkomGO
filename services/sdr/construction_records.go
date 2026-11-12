package main

import (
	"deeph/pkg/construction"
	"encoding/json"
	"errors"
)

// Called under a.mu. The request gets only this tenant/application's collection
// and a fresh host-generated identity for a possible create operation.
func (a *App) previewRecords(org, appID string) *construction.RecordsSnapshot {
	if a.db == nil {
		return nil
	}
	items := a.state.Platform.PreviewRecords[org][appID]
	snapshot := &construction.RecordsSnapshot{Items: make([]construction.Record, len(items)), NextID: "record_" + token(), NextCreatedAt: a.now().UTC()}
	for i, v := range items {
		snapshot.Items[i] = v
		snapshot.Items[i].Value = append(json.RawMessage(nil), v.Value...)
	}
	return snapshot
}

func (a *App) validatePreviewRecord(org, appID string, snapshot *construction.RecordsSnapshot, created *construction.Record) error {
	if snapshot == nil || snapshot.NextID == "" || snapshot.NextCreatedAt.IsZero() || created.ID != snapshot.NextID || !created.CreatedAt.Equal(snapshot.NextCreatedAt) || !construction.ValidRecord(created.Value) {
		return errors.New("preview_records_invalid")
	}
	items := a.state.Platform.PreviewRecords[org][appID]
	if len(items) != len(snapshot.Items) {
		return errors.New("preview_data_conflict")
	}
	if len(items) >= construction.MaxRecords {
		return errors.New("preview_records_limit")
	}
	for _, item := range items {
		if item.ID == created.ID {
			return errors.New("preview_records_invalid")
		}
	}
	return nil
}

// Invoked only inside the host transaction, after validation of all mutations.
func (a *App) appendPreviewRecord(u User, appID string, created construction.Record) {
	if a.state.Platform.PreviewRecords == nil {
		a.state.Platform.PreviewRecords = map[string]map[string][]construction.Record{}
	}
	if a.state.Platform.PreviewRecords[u.Org] == nil {
		a.state.Platform.PreviewRecords[u.Org] = map[string][]construction.Record{}
	}
	created.Value, _ = json.Marshal(created.Value)
	items := append(a.state.Platform.PreviewRecords[u.Org][appID], created)
	a.state.Platform.PreviewRecords[u.Org][appID] = items
	a.record(AuditEntry{Org: u.Org, Actor: u.ID, Action: "preview.record_created", Operation: appID, Revision: len(items)})
}
