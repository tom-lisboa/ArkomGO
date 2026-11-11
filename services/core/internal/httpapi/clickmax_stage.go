package httpapi

import (
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/store"
)

// A pipeline event carries identities, never an unverified destination or consent.
// The current card, workspace, assignee and messaging preferences are read again
// before handing ownership to the same durable intake used by the form.
func (s *Server) productionClickMaxCard(w http.ResponseWriter, r *http.Request, cardID, contactID, stageID string) {
	cardID, contactID, stageID = strings.ToLower(strings.TrimSpace(cardID)), strings.ToLower(strings.TrimSpace(contactID)), strings.ToLower(strings.TrimSpace(stageID))
	if !clickmax.ValidID(cardID) || !clickmax.ValidID(contactID) || !clickmax.ValidID(stageID) {
		write(w, 422, map[string]string{"error": "invalid_clickmax_pipeline_event"})
		return
	}
	if s.ClickMax == nil || s.ClickMaxPipeline == "" || s.ClickMaxBiaAttendant == "" || len(s.ClickMaxStages) == 0 {
		write(w, 503, map[string]string{"error": "clickmax_pipeline_intake_unavailable"})
		return
	}
	eligible := false
	for _, name := range []string{"contact_pending", "contacted", "attempt_2", "attempt_3", "no_show"} {
		if s.ClickMaxStages[name] == stageID {
			eligible = true
		}
	}
	if !eligible {
		write(w, 422, map[string]string{"error": "clickmax_stage_not_supported"})
		return
	}
	card, err := s.ClickMax.Card(r.Context(), cardID)
	if err != nil {
		write(w, 503, map[string]string{"error": "clickmax_verification_unavailable"})
		return
	}
	ignored := func(reason string) {
		write(w, 202, map[string]any{"status": "ignored", "reason": reason, "duplicate": false})
	}
	if card.PipelineID != s.ClickMaxPipeline || card.StageID != stageID || card.Status != "open" || len(card.LeadIDs) != 1 || card.LeadIDs[0] != contactID {
		ignored("card_changed_or_not_eligible")
		return
	}
	// New registrations are automatically assigned to sellers by the CRM.
	// Assignment alone is not a human conversation. Only admit a fresh card
	// here; older human-owned cards and the SDR's human/pause flags stay intact.
	now := time.Now()
	freshRegistration := card.StageID == s.ClickMaxStages["contact_pending"] &&
		!card.CreatedAt.IsZero() && !card.CreatedAt.Before(now.Add(-15*time.Minute)) && !card.CreatedAt.After(now.Add(time.Minute))
	if card.ResponsibleAttendantID != "" && card.ResponsibleAttendantID != s.ClickMaxBiaAttendant && !freshRegistration {
		ignored("human_assignee")
		return
	}
	contact, err := s.ClickMax.Contact(r.Context(), contactID)
	if err != nil {
		write(w, 503, map[string]string{"error": "clickmax_verification_unavailable"})
		return
	}
	if contact.MessagePreferences.WhatsApp == nil || !*contact.MessagePreferences.WhatsApp {
		ignored("whatsapp_not_authorized")
		return
	}
	for _, tag := range contact.Tags {
		if tag.ID == "68a14eaa-04a9-412f-8c02-431a5c5ea1d7" || strings.EqualFold(strings.TrimSpace(tag.Name), "optout-whatsapp") {
			ignored("whatsapp_opted_out")
			return
		}
	}
	phone, err := domain.NormalizePhone("+" + strings.TrimPrefix(strings.TrimSpace(contact.Phone), "+"))
	if err != nil {
		ignored("invalid_contact_phone")
		return
	}
	f := domain.Form{Name: strings.TrimSpace(contact.Name), Email: strings.TrimSpace(contact.Email), Phone: phone, Consent: true,
		Source: "production_form", Channel: "gateway", ProviderLeadID: contactID, ConsentTextVersion: "clickmax-whatsapp-preferences-v1"}
	if f.Name == "" {
		ignored("contact_name_required")
		return
	}
	var appointment clickmax.Appointment
	if scheduled := card.OpenScheduledCall; scheduled != nil && scheduled.End.After(time.Now()) {
		appointment, err = s.ClickMax.Appointment(r.Context(), scheduled.ID)
		if err != nil {
			write(w, 503, map[string]string{"error": "clickmax_booking_verification_unavailable"})
			return
		}
		if !appointment.Active() || appointment.ContactID != contact.ID || appointment.ScheduleID != s.ClickMaxSchedule ||
			!slices.Contains(store.WhatsAppPhoneVariants(phone), "+"+strings.TrimPrefix(strings.TrimSpace(appointment.LeadPhone), "+")) {
			ignored("booking_calendar_not_connected")
			return
		}
	}
	eventID, status, duplicate, err := s.DB.SubmitClickMaxCard(r.Context(), s.VoiceSender, f, card, appointment)
	if errors.Is(err, store.ErrConflict) {
		ignored("contact_or_card_blocked")
		return
	}
	if err != nil {
		write(w, 503, map[string]string{"error": "storage_unavailable"})
		return
	}
	if s.ClickMaxGoTag != "" {
		marked := false
		for _, tag := range contact.Tags {
			if tag.ID == s.ClickMaxGoTag {
				marked = true
			}
		}
		if !marked && s.ClickMax.ApplyTag(r.Context(), contact.ID, s.ClickMaxGoTag) != nil {
			// The intake is durable; retries repair the marker without re-sending.
			write(w, 503, map[string]string{"error": "clickmax_ownership_marker_pending"})
			return
		}
	}
	write(w, 202, map[string]any{"status": status, "event_id": eventID, "duplicate": duplicate, "requires_whatsapp_action": false})
}
