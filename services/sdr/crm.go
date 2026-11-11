package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

var crmUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type crmRoute struct {
	Origin       string            `json:"origin"`
	Organization string            `json:"organization_id"`
	Installation string            `json:"bia_installation_id"`
	Token        string            `json:"token"`
	Contacts     map[string]string `json:"contacts"`
}

type crmEvent struct {
	ID           string            `json:"event_id"`
	Organization string            `json:"organization_id"`
	Source       string            `json:"source_solution"`
	Type         string            `json:"event_type"`
	Subject      string            `json:"subject"`
	OccurredAt   time.Time         `json:"occurred_at"`
	Data         map[string]string `json:"data"`
}

func (a *App) configureCRM() error {
	path := os.Getenv("SDR_CRM_ROUTES_FILE")
	if path == "" {
		return nil
	}
	if os.Getenv("SDR_CRM_DEV_ENABLED") != "true" {
		return errors.New("CRM routes require explicit development mode")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, &a.crmRoutes); err != nil {
		return err
	}
	for org, route := range a.crmRoutes {
		u, err := url.Parse(route.Origin)
		if err != nil || u.Hostname() == "" || u.User != nil || u.Fragment != "" ||
			u.RawQuery != "" || (u.Path != "" && u.Path != "/") ||
			(u.Scheme != "https" && !(u.Scheme == "http" && u.Hostname() == "127.0.0.1")) ||
			!crmUUID.MatchString(route.Organization) || !crmUUID.MatchString(route.Installation) ||
			!strings.HasPrefix(route.Token, "arkom_service_") || len(route.Token) != 57 || org == "" {
			return errors.New("invalid CRM route")
		}
		for _, lead := range route.Contacts {
			if !crmUUID.MatchString(lead) {
				return errors.New("invalid CRM contact mapping")
			}
		}
	}
	return nil
}

// queueQualifiedCRM runs in the transaction that stores validated conversation facts.
func (a *App) queueQualifiedCRM(conversation *Conversation) {
	route, ok := a.crmRoutes[conversation.Org]
	if !ok || conversation.OptedOut {
		return
	}
	lead := a.state.CRMContacts[conversation.Org][conversation.Contact]
	if lead == "" {
		lead = route.Contacts[conversation.Contact]
	}
	if lead == "" {
		return
	}
	now := a.now().UTC()
	facts := a.state.Pipeline.Memory[conversation.ID]
	for _, key := range []string{"company", "goal"} {
		fact := facts[key]
		if strings.TrimSpace(fact.Value) == "" || !fact.ExpiresAt.After(now) {
			return
		}
	}

	id := fmt.Sprintf("crm-qualification-%x", sha256.Sum256([]byte(route.Installation+":"+conversation.ID)))
	if _, exists := a.state.CRMOutbox[id]; exists {
		return
	}
	if a.state.CRMOutbox == nil {
		a.state.CRMOutbox = make(map[string]crmEvent)
	}
	a.state.CRMOutbox[id] = crmEvent{
		ID: id, Organization: route.Organization, Source: "bia-sdr",
		Type: "bia-sdr.crm.opportunity-qualified.v1", Subject: conversation.ID, OccurredAt: now,
		Data: map[string]string{
			"bia_installation_id": route.Installation, "clickmax_lead_id": lead,
			"title": "Lead qualificado pela Bia",
		},
	}
}

func (a *App) runCRM(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	client := &http.Client{
		Timeout:       8 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.flushCRM(ctx, client)
		}
	}
}

func (a *App) flushCRM(ctx context.Context, client *http.Client) {
	a.mu.Lock()
	events := make([]crmEvent, 0, len(a.state.CRMOutbox))
	for _, event := range a.state.CRMOutbox {
		if strings.HasPrefix(event.ID, "crm-qualification-") && event.Data != nil {
			events = append(events, event)
		}
	}
	a.mu.Unlock()
	for _, event := range events {
		for _, route := range a.crmRoutes {
			if route.Organization != event.Organization || route.Installation != event.Data["bia_installation_id"] {
				continue
			}
			if err := publishCRM(ctx, client, route, event); err != nil {
				log.Print("CRM event delivery pending")
				break
			}
			a.mu.Lock()
			err := a.transact(func() { a.state.CRMOutbox[event.ID] = crmEvent{} })
			a.mu.Unlock()
			if err != nil {
				log.Print("CRM event receipt persistence pending")
			}
			break
		}
	}
}

func publishCRM(ctx context.Context, client *http.Client, route crmRoute, event crmEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(route.Origin, "/")+"/integration/v1/events", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+route.Token)
	req.Header.Set("X-Organization-ID", event.Organization)
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusAccepted {
		return fmt.Errorf("CRM event refused: HTTP %d", res.StatusCode)
	}
	return nil
}
