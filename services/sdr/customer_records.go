package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"sdr-next-pilot/internal/dataworker"
	"sort"
	"time"
)

var customerCollections = []string{"conversations", "messages", "contacts", "memory", "business", "workflows", "executions", "context_runs", "ai_runs", "context_receipts", "media", "media_jobs", "notes", "deliveries", "audit", "worker_events", "whatsapp", "calendars", "calendar_connections", "calendar_bookings", "calendar_requests"}

// Called while holding a.mu. Explicit projections prevent internal credentials,
// worker leases, raw state snapshots and other tenants from becoming API data.
func (a *App) customerRecords(org, collection string) ([]dataworker.Record, error) {
	out := []dataworker.Record{}
	add := func(id, conversation string, at time.Time, value any) {
		raw, _ := json.Marshal(value)
		out = append(out, dataworker.Record{ID: id, Collection: collection, Conversation: conversation, At: at, Data: raw})
	}
	owned := func(id string) bool { c := a.state.Conversations[id]; return c != nil && c.Org == org }
	switch collection {
	case "calendars", "calendar_connections", "calendar_bookings", "calendar_requests":
		items, e := a.calendarCustomerRecords(org, collection)
		if e != nil {
			return nil, e
		}
		for _, item := range items {
			add(item.ID, item.Conversation, item.At, item.Data)
		}
	case "conversations", "messages", "contacts", "memory":
		for id, c := range a.state.Conversations {
			if c.Org != org {
				continue
			}
			switch collection {
			case "conversations":
				add(id, id, c.Updated, c)
			case "contacts":
				phone := ""
				if binding, ok := a.state.Transport.Bindings[id]; ok && binding.Org == org {
					phone = binding.Target
				}
				add(id, id, c.Updated, map[string]any{"contact_id": c.Contact, "conversation_id": id, "name": c.Label, "whatsapp_address": phone})
			case "messages":
				for _, m := range a.state.Messages[id] {
					if m.Conversation == id {
						add(m.ID, id, m.Created, m)
					}
				}
			case "memory":
				for key, f := range a.state.Pipeline.Memory[id] {
					add(id+":"+key, id, time.Time{}, f)
				}
			}
		}
	case "business":
		if w := a.state.Business[org]; w != nil {
			add("draft", "", w.UpdatedAt, map[string]any{"revision": w.Revision, "profile": w.Draft})
			for _, v := range w.Versions {
				add(fmt.Sprintf("version-%06d", v.Version), "", v.PublishedAt, v)
			}
		}
	case "workflows":
		if w := a.state.Platform.Workspaces[org]; w != nil {
			add("draft", "", w.UpdatedAt, map[string]any{"revision": w.Revision, "configuration": w.Draft})
			for _, v := range w.Versions {
				add(fmt.Sprintf("version-%06d", v.Version), "", v.PublishedAt, v)
			}
		}
	case "executions":
		for id, e := range a.state.Platform.Executions {
			if e.Org == org {
				add(id, e.TriggerConversation, e.CreatedAt, map[string]any{"execution": a.operationView(e, User{Org: org, Role: "admin"}), "configuration": e.Config, "business_context": e.Business, "events": e.Events})
			}
		}
	case "context_runs":
		for _, j := range a.state.Pipeline.Windows {
			if j.Org == org && owned(j.Conversation) {
				add(j.ID, j.Conversation, j.FirstAt, map[string]any{"id": j.ID, "conversation_id": j.Conversation, "status": j.Status, "error": j.Error, "input_ids": j.InputIDs, "attempts": j.Attempts, "first_at": j.FirstAt, "last_at": j.LastAt})
			}
		}
	case "ai_runs":
		for id, j := range a.state.Pipeline.Runs {
			if j.Org != org || !owned(j.Conversation) {
				continue
			}
			view := map[string]any{"id": id, "conversation_id": j.Conversation, "status": j.Status, "error": j.Error, "action": j.Action, "message_id": j.MessageID, "suggested_response": j.SuggestedResponse, "model": j.Model, "attempts": j.Attempts, "input_tokens": j.InputTokens, "output_tokens": j.OutputTokens, "created_at": j.CreatedAt, "completed_at": j.CompletedAt}
			if j.Context.Organization == org && j.Context.Conversation == j.Conversation {
				view["context"] = map[string]any{"business_version": j.Context.BusinessVersion, "business": j.Context.Business, "input_ids": j.Context.InputIDs, "history": j.Context.History, "memory": j.Context.Memory, "truncated": j.Context.Truncated, "prepared_at": j.Context.At}
			}
			add(id, j.Conversation, j.CreatedAt, view)
		}
	case "context_receipts":
		for id, r := range a.state.ContextReceipts {
			if r.Organization == org && (r.Conversation == "" || owned(r.Conversation)) {
				add(id, r.Conversation, r.PreparedAt, r)
			}
		}
	case "media":
		for id, m := range a.state.Media.Assets {
			if m.Organization == org && (m.Conversation == "" || owned(m.Conversation)) {
				add(id, m.Conversation, m.Created, m)
			}
		}
	case "media_jobs":
		for id, j := range a.state.Media.Jobs {
			if j.Org == org && (j.Conversation == "" || owned(j.Conversation)) {
				add(id, j.Conversation, j.Created, map[string]any{"id": id, "conversation_id": j.Conversation, "direction": j.Direction, "file": j.File, "status": j.Status, "attempts": j.Attempts, "created_at": j.Created})
			}
		}
	case "notes":
		for id, n := range a.state.Platform.Notes {
			if n.Org == org && owned(n.Conversation) {
				add(id, n.Conversation, n.At, n)
			}
		}
	case "deliveries":
		for id, d := range a.state.Transport.Deliveries {
			e := d.Envelope
			if e.Organization == org && owned(e.Conversation) {
				add(id, e.Conversation, time.Time{}, map[string]any{"id": id, "conversation_id": e.Conversation, "status": d.Status, "provider_message_id": d.ProviderID, "text": e.Text, "target": e.Target, "media_id": e.MediaID, "automatic": e.Automatic})
			}
		}
	case "audit":
		if a.db == nil {
			for _, v := range a.state.Audit {
				if v.Org == org {
					at, _ := time.Parse(time.RFC3339Nano, v.At)
					add(v.ID, v.Conversation, at, v)
				}
			}
			break
		}
		rows, e := a.db.Query("SELECT id,organization_id,actor_id,action,conversation_id,operation_id,revision,reason,at FROM audit WHERE organization_id=? ORDER BY seq LIMIT 20001", org)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		for rows.Next() {
			var v AuditEntry
			if e = rows.Scan(&v.ID, &v.Org, &v.Actor, &v.Action, &v.Conversation, &v.Operation, &v.Revision, &v.Reason, &v.At); e != nil {
				return nil, e
			}
			at, _ := time.Parse(time.RFC3339Nano, v.At)
			add(v.ID, v.Conversation, at, v)
		}
		if rows.Err() != nil {
			return nil, rows.Err()
		}
	case "worker_events":
		if a.db == nil {
			break
		}
		rows, e := a.db.Query("SELECT payload FROM worker_events WHERE json_extract(payload,'$.organization_id')=? ORDER BY seq LIMIT 20001", org)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		for rows.Next() {
			var raw []byte
			if e = rows.Scan(&raw); e != nil {
				return nil, e
			}
			var v struct {
				ID           string    `json:"id"`
				Organization string    `json:"organization_id"`
				At           time.Time `json:"at"`
			}
			if json.Unmarshal(raw, &v) != nil || v.Organization != org {
				return nil, errors.New("tenant_event_invalid")
			}
			add(v.ID, "", v.At, json.RawMessage(raw))
		}
		if rows.Err() != nil {
			return nil, rows.Err()
		}
	case "whatsapp":
		// Pairing codes, QR images, encryption state and provider credentials stay private.
		add("policy", "", a.state.Transport.LastSync[org], a.messagingView(org))
		if a.db != nil {
			var provisioning string
			var raw []byte
			if e := a.db.QueryRow("SELECT provisioning,view FROM whatsapp_channels WHERE organization_id=?", org).Scan(&provisioning, &raw); e == nil {
				var v WhatsAppView
				if json.Unmarshal(raw, &v) == nil {
					add("channel", "", time.Time{}, map[string]any{"status": v.Status, "provisioning": provisioning})
				}
			}
			rows, e := a.db.Query("SELECT id,kind,phone,status,attempts,created_at FROM whatsapp_jobs WHERE organization_id=? ORDER BY created_at LIMIT 20001", org)
			if e != nil {
				return nil, e
			}
			defer rows.Close()
			for rows.Next() {
				var id, kind, phone, status string
				var attempts int
				var at int64
				if e = rows.Scan(&id, &kind, &phone, &status, &attempts, &at); e != nil {
					return nil, e
				}
				add("command-"+id, "", time.Unix(at, 0).UTC(), map[string]any{"id": id, "kind": kind, "phone": phone, "status": status, "attempts": attempts})
			}
			if rows.Err() != nil {
				return nil, rows.Err()
			}
		}
	default:
		return nil, errors.New("unknown_collection")
	}
	if len(out) > 20000 {
		return nil, errors.New("customer_dataset_limit")
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}
