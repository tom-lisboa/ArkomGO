package crmsync

import (
	"context"
	"strings"

	sdk "clickmax.io/go"
	"github.com/tom-lisboa/CRMGO/internal/clickmax"
)

type contactSummary struct {
	ID        string  `json:"id"`
	Name      *string `json:"name,omitempty"`
	Email     *string `json:"email,omitempty"`
	Telephone *string `json:"telephone,omitempty"`
	EditURL   string  `json:"edit_url,omitempty"`
}

func listContacts(ctx context.Context, client *sdk.Client, slug string, input CRMRequest) (any, error) {
	query := strings.TrimSpace(input.Query)
	if len(query) > 254 || input.Page < 0 || input.Page > 100000 {
		return nil, ErrPayload
	}
	page := max(1, input.Page)
	filters := []sdk.LeadsSearchInputFiltersItem{}
	if query != "" {
		field := sdk.LeadsSearchInputFiltersItemFieldName
		switch input.SearchBy {
		case "", "name":
		case "email":
			field = sdk.LeadsSearchInputFiltersItemFieldEmail
		case "telephone":
			field = sdk.LeadsSearchInputFiltersItemFieldTelephone
		default:
			return nil, ErrPayload
		}
		filters = append(filters, sdk.LeadsSearchInputFiltersItem{
			Field: field, Operator: sdk.LeadsSearchInputFiltersItemOperatorContains,
			ValueString: sdk.NewNullable(query),
		})
	}
	result, err := client.Leads.Search(ctx, sdk.LeadsSearchInput{
		Filters: filters, Page: &page, PerPage: sdk.Ptr[int64](25),
	})
	if err != nil {
		return nil, err
	}
	contacts := make([]contactSummary, 0, len(result.Data))
	for _, lead := range result.Data {
		if !clickmax.ValidID(lead.ID) {
			continue
		}
		contact := contactSummary{ID: lead.ID, Name: lead.Name, Email: lead.Email, Telephone: lead.Telephone}
		if slug != "" {
			contact.EditURL = "https://app.clickmax.io/" + slug + "/leads/" + lead.ID
		}
		contacts = append(contacts, contact)
	}
	return struct {
		Data  []contactSummary `json:"data"`
		Page  int64            `json:"page"`
		Pages int64            `json:"pages"`
	}{Data: contacts, Page: page, Pages: result.Meta.CountPages}, nil
}
