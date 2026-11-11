// Package arkom compiles bounded changes against the Arkom capability catalog.
// Model output is data: it never supplies paths, commands, dependencies or code.
package arkom

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strings"
)

//go:embed catalog.json
var Catalog string

const CatalogVersion = "arkom-capabilities-v1"

var Fields = []string{"company", "goal", "name", "segment", "sellers", "contact_volume", "current_tool"}
var Dependencies = []string{"sdr.memory.v1", "crm.qualification.v1", "crm.opportunity.v1"}

type Spec struct {
	CatalogVersion string   `json:"catalog_version"`
	Kind           string   `json:"kind"`
	Backend        string   `json:"backend"`
	Deployment     string   `json:"deployment"`
	Reuses         []string `json:"reuses"`
	RequiredFields []string `json:"required_fields"`
	Title          string   `json:"title"`
}
type Review struct {
	Summary string `json:"summary"`
	Change  *Spec  `json:"change"`
}

func Default() Spec {
	return Spec{CatalogVersion, "crm.qualification.v1", "go", "arkom", slices.Clone(Dependencies), []string{"company", "goal"}, "Lead qualificado pela Bia"}
}
func (s Spec) Validate() error {
	if s.CatalogVersion != CatalogVersion || s.Kind != "crm.qualification.v1" || s.Backend != "go" || s.Deployment != "arkom" {
		return errors.New("unsupported_architecture")
	}
	if len(s.Reuses) != len(Dependencies) {
		return errors.New("missing_capability")
	}
	seen := map[string]bool{}
	for _, id := range s.Reuses {
		if !slices.Contains(Dependencies, id) || seen[id] {
			return errors.New("unsupported_capability")
		}
		seen[id] = true
	}
	if len(s.RequiredFields) < 2 || len(s.RequiredFields) > len(Fields) || !slices.Contains(s.RequiredFields, "company") || !slices.Contains(s.RequiredFields, "goal") {
		return errors.New("baseline_qualification_required")
	}
	seen = map[string]bool{}
	for _, f := range s.RequiredFields {
		if !slices.Contains(Fields, f) || seen[f] {
			return errors.New("unsupported_memory_field")
		}
		seen[f] = true
	}
	if strings.TrimSpace(s.Title) == "" || len([]rune(s.Title)) > 100 || strings.ContainsAny(s.Title, "\n\r\x00") {
		return errors.New("invalid_title")
	}
	return nil
}
func ParseReview(raw string) (Review, error) {
	var r Review
	d := json.NewDecoder(bytes.NewBufferString(raw))
	d.DisallowUnknownFields()
	if len(raw) > 12000 || d.Decode(&r) != nil || d.Decode(new(any)) != io.EOF {
		return r, errors.New("invalid_review_json")
	}
	if strings.TrimSpace(r.Summary) == "" || len([]rune(r.Summary)) > 2000 {
		return r, errors.New("invalid_summary")
	}
	if r.Change != nil {
		return r, r.Change.Validate()
	}
	return r, nil
}

// Missing takes only non-expired facts supplied by the authenticated host.
func (s Spec) Missing(facts map[string]string) []string {
	missing := []string{}
	for _, f := range s.RequiredFields {
		if strings.TrimSpace(facts[f]) == "" {
			missing = append(missing, f)
		}
	}
	return missing
}
