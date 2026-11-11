package httpapi

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
	"arkom/bia/internal/store"
)

func (s *Server) productionForm(w http.ResponseWriter, r *http.Request) {
	auth := []byte(r.Header.Get("Authorization"))
	primary := len(s.IntakeToken) >= 32 && subtle.ConstantTimeCompare(auth, []byte("Bearer "+s.IntakeToken)) == 1
	bilhon := len(s.ClickMaxBilhonIntakeToken) >= 32 && subtle.ConstantTimeCompare(auth, []byte("Bearer "+s.ClickMaxBilhonIntakeToken)) == 1
	if !primary && !bilhon {
		w.Header().Set("WWW-Authenticate", "Bearer")
		write(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !s.FormAutoContact || s.Mode != "live" || s.VoiceSender == "" {
		write(w, http.StatusServiceUnavailable, map[string]string{"error": "production_intake_unavailable"})
		return
	}
	id := r.Header.Get("Idempotency-Key")
	var input struct {
		ClickMaxCardID    string `json:"clickmax_card_id"`
		ClickMaxContactID string `json:"clickmax_contact_id"`
		ClickMaxStageID   string `json:"clickmax_stage_id"`
		ClickMaxBookingID string `json:"clickmax_booking_id"`
		ClickMaxCalendar  string `json:"clickmax_calendar"`
		Name              string `json:"name"`
		Company           string `json:"company"`
		Phone             string `json:"phone"`
		Email             string `json:"email"`
		Revenue           *int64 `json:"revenue"`
		Goal              string `json:"goal"`
		TimeZone          string `json:"timezone"`
		Consent           bool   `json:"consent"`
		SMSConsent        bool   `json:"sms_consent"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.ClickMaxCardID != "" || input.ClickMaxContactID != "" || input.ClickMaxStageID != "" {
		if !primary || input.ClickMaxCalendar != "" || input.ClickMaxBookingID != "" {
			write(w, 403, map[string]string{"error": "clickmax_calendar_not_authorized"})
			return
		}
		s.productionClickMaxCard(w, r, input.ClickMaxCardID, input.ClickMaxContactID, input.ClickMaxStageID)
		return
	}
	bookingID := strings.ToLower(strings.TrimSpace(input.ClickMaxBookingID))
	calendar := strings.TrimSpace(input.ClickMaxCalendar)
	if calendar != "" && (calendar != "bilhon" || bookingID == "") {
		write(w, 422, map[string]string{"error": "invalid_clickmax_calendar", "field": "clickmax_calendar"})
		return
	}
	if (calendar == "bilhon") != bilhon {
		write(w, 403, map[string]string{"error": "clickmax_calendar_not_authorized"})
		return
	}
	if bookingID != "" {
		if !clickmax.ValidID(bookingID) {
			write(w, 422, map[string]string{"error": "invalid_clickmax_booking_id", "field": "clickmax_booking_id"})
			return
		}
		id = "clickmax-booking-" + bookingID
	}
	if !domain.ValidID(id) || len(id) > 100 {
		write(w, 422, map[string]string{"error": "valid_idempotency_key_required", "field": "Idempotency-Key"})
		return
	}
	if !input.Consent {
		write(w, 422, map[string]string{"error": "whatsapp_consent_required", "field": "consent"})
		return
	}
	phone, err := domain.NormalizePhone(input.Phone)
	if err != nil {
		write(w, 422, map[string]string{"error": "phone_must_be_e164", "field": "phone"})
		return
	}
	f := domain.Form{
		Name: strings.TrimSpace(input.Name), Company: strings.TrimSpace(input.Company), Phone: phone,
		Email: strings.TrimSpace(input.Email), Goal: strings.TrimSpace(input.Goal), Revenue: input.Revenue,
		TimeZone: strings.TrimSpace(input.TimeZone), Consent: true, ConsentTextVersion: "bia-site-whatsapp-v1",
		Source: "production_form", Channel: "gateway",
	}
	if input.SMSConsent {
		f.SMSConsent, f.SMSPhone, f.SMSConsentVersion = true, phone, "bia-site-sms-v1"
	}
	if err := domain.ValidateEvent(domain.Event{ID: id, LeadID: domain.LeadKey(phone), Kind: "form.contact_requested", At: time.Now(), Form: &f}); err != nil {
		write(w, 422, map[string]any{"error": err.Error(), "fields": formValidationFields(err.Error(), f)})
		return
	}
	var appointment clickmax.Appointment
	var verifiedContact clickmax.Contact
	if bookingID != "" {
		client, schedule, since := s.ClickMax, s.ClickMaxSchedule, time.Time{}
		if calendar == "bilhon" {
			client, schedule, since = s.ClickMaxBilhon, s.ClickMaxBilhonSchedule, s.ClickMaxBilhonSince
		}
		if client == nil || schedule == "" {
			write(w, 503, map[string]string{"error": "clickmax_calendar_unavailable"})
			return
		}
		appointment, err = client.Appointment(r.Context(), bookingID)
		if err != nil {
			write(w, 503, map[string]string{"error": "clickmax_booking_verification_unavailable"})
			return
		}
		providerPhone := "+" + strings.TrimPrefix(strings.TrimSpace(appointment.LeadPhone), "+")
		if appointment.ID != bookingID || !clickmax.ValidID(appointment.ContactID) || !appointment.Active() ||
			!appointment.Start.After(time.Now()) || !appointment.End.After(appointment.Start) ||
			appointment.ScheduleID != schedule || (!since.IsZero() && appointment.CreatedAt.Before(since)) ||
			!slices.Contains(store.WhatsAppPhoneVariants(phone), providerPhone) ||
			(f.Email != "" && appointment.LeadEmail != "" && !strings.EqualFold(f.Email, appointment.LeadEmail)) {
			write(w, 409, map[string]string{"error": "clickmax_booking_mismatch"})
			return
		}
		if calendar == "" && s.ClickMaxGoTag != "" {
			verifiedContact, err = client.Contact(r.Context(), appointment.ContactID)
			if err != nil {
				write(w, 503, map[string]string{"error": "clickmax_contact_verification_unavailable"})
				return
			}
			allowed := verifiedContact.MessagePreferences.WhatsApp != nil && *verifiedContact.MessagePreferences.WhatsApp
			for _, tag := range verifiedContact.Tags {
				if tag.ID == "68a14eaa-04a9-412f-8c02-431a5c5ea1d7" || strings.EqualFold(strings.TrimSpace(tag.Name), "optout-whatsapp") {
					allowed = false
				}
			}
			if !allowed {
				write(w, 202, map[string]any{"status": "ignored", "reason": "whatsapp_not_authorized", "duplicate": false})
				return
			}
		}
	}
	eventID, duplicate, err := s.DB.SubmitProductionForm(r.Context(), id, s.VoiceSender, f, appointment)
	if errors.Is(err, store.ErrConflict) {
		write(w, 409, map[string]string{"error": "idempotency_conflict"})
		return
	}
	if err != nil {
		write(w, 503, map[string]string{"error": "storage_unavailable"})
		return
	}
	if verifiedContact.ID != "" {
		marked := false
		for _, tag := range verifiedContact.Tags {
			if tag.ID == s.ClickMaxGoTag {
				marked = true
			}
		}
		if !marked && s.ClickMax.ApplyTag(r.Context(), verifiedContact.ID, s.ClickMaxGoTag) != nil {
			write(w, 503, map[string]string{"error": "clickmax_ownership_marker_pending"})
			return
		}
	}
	if eventID == "" && duplicate {
		write(w, http.StatusAccepted, map[string]any{"status": "booking_already_linked", "duplicate": true})
		return
	}
	write(w, http.StatusAccepted, map[string]any{
		"status": "contact_queued", "submission_id": id, "event_id": eventID,
		"duplicate": duplicate, "requires_whatsapp_action": false,
	})
}
