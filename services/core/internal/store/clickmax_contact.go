package store

import (
	"context"
	"slices"
	"strings"

	"arkom/bia/internal/clickmax"
	"arkom/bia/internal/domain"
)

// FindClickMaxContact matches the WhatsApp identity, using email to
// disambiguate multiple CRM contacts with the same phone.
func FindClickMaxContact(ctx context.Context, client *clickmax.Client, f domain.Form) (string, string, error) {
	phone, err := domain.NormalizePhone(f.Phone)
	if err != nil || len(phone) < 9 {
		return "", "clickmax_contact_not_found", nil
	}
	items, err := client.ContactsByPhoneSuffix(ctx, phone[len(phone)-8:])
	if err != nil {
		return "", "", err
	}
	variants := WhatsAppPhoneVariants(phone)
	var matching, matchingEmail []string
	email := strings.TrimSpace(f.Email)
	for _, item := range items {
		remotePhone, err := domain.NormalizePhone("+" + strings.TrimPrefix(strings.TrimSpace(item.Phone), "+"))
		if err != nil || !slices.Contains(variants, remotePhone) || !clickmax.ValidID(item.ID) {
			continue
		}
		matching = append(matching, item.ID)
		if email != "" && strings.EqualFold(strings.TrimSpace(item.Email), email) {
			matchingEmail = append(matchingEmail, item.ID)
		}
	}
	if len(matchingEmail) == 1 {
		return matchingEmail[0], "", nil
	}
	if len(matching) == 1 {
		if email != "" && len(matchingEmail) == 0 {
			for _, item := range items {
				if item.ID == matching[0] && strings.TrimSpace(item.Email) != "" {
					return "", "clickmax_contact_ambiguous", nil
				}
			}
		}
		return matching[0], "", nil
	}
	if len(matching) > 1 {
		return "", "clickmax_contact_ambiguous", nil
	}
	return "", "clickmax_contact_not_found", nil
}
