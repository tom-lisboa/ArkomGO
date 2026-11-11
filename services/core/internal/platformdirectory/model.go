package platformdirectory

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"

	access "arkom/bia/pkg/platformaccess"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var Schema string
var ErrInvalid = errors.New("invalid_directory_request")
var ErrConflict = errors.New("directory_conflict")

type Store struct{ DB *pgxpool.Pool }
type MemberInput struct {
	Reference string `json:"reference"`
	Name      string `json:"name"`
}
type GrantInput struct {
	PersonReference string `json:"person_reference"`
	LocalActorID    string `json:"local_actor_id"`
	Role            string `json:"role"`
}
type ProductInput struct {
	Solution            string       `json:"solution"`
	Backend             string       `json:"backend"`
	LocalOrganizationID string       `json:"local_organization_id"`
	Grants              []GrantInput `json:"grants"`
}
type Registration struct {
	Namespace              string         `json:"namespace"`
	Key                    string         `json:"idempotency_key"`
	CustomerReference      string         `json:"customer_reference"`
	OrganizationReference  string         `json:"organization_reference"`
	Name                   string         `json:"name"`
	ExistingOrganizationID string         `json:"existing_organization_id,omitempty"`
	Members                []MemberInput  `json:"members"`
	Products               []ProductInput `json:"products"`
}
type Registered struct {
	CustomerID     string            `json:"customer_id"`
	OrganizationID string            `json:"organization_id"`
	People         map[string]string `json:"people"`
}

func validName(v string) bool {
	if len(v) < 1 || len(v) > 160 || strings.TrimSpace(v) != v {
		return false
	}
	for _, r := range v {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
func (r Registration) validate() error {
	if !access.ValidReference(r.Namespace) || !access.ValidReference(r.Key) || !access.ValidReference(r.CustomerReference) || !access.ValidReference(r.OrganizationReference) || !validName(r.Name) || len(r.Members) < 1 || len(r.Members) > 100 || len(r.Products) < 1 || len(r.Products) > 4 {
		return ErrInvalid
	}
	if r.ExistingOrganizationID != "" && !access.ValidID(r.ExistingOrganizationID) {
		return ErrInvalid
	}
	people := map[string]bool{}
	for _, m := range r.Members {
		if !access.ValidReference(m.Reference) || !validName(m.Name) || people[m.Reference] {
			return ErrInvalid
		}
		people[m.Reference] = true
	}
	products := map[string]bool{}
	for _, p := range r.Products {
		if !access.ValidSolution(p.Solution) || !access.ValidReference(p.Backend) || !access.ValidReference(p.LocalOrganizationID) || products[p.Solution] || len(p.Grants) < 1 || len(p.Grants) > 100 {
			return ErrInvalid
		}
		products[p.Solution] = true
		actors, granted := map[string]bool{}, map[string]bool{}
		for _, g := range p.Grants {
			if !people[g.PersonReference] || !access.ValidReference(g.LocalActorID) || access.RoleRank(g.Role) == 0 || actors[g.LocalActorID] || granted[g.PersonReference] {
				return ErrInvalid
			}
			actors[g.LocalActorID] = true
			granted[g.PersonReference] = true
		}
	}
	return nil
}
func fingerprint(v any) string { b, _ := json.Marshal(v); return fmt.Sprintf("%x", sha256.Sum256(b)) }
func conflict(err error) error {
	if err == nil {
		return nil
	}
	var state interface{ SQLState() string }
	if errors.As(err, &state) && (state.SQLState() == "23505" || state.SQLState() == "23503") {
		return ErrConflict
	}
	return err
}
func audit(ctx context.Context, tx pgx.Tx, action string, target any, reason string) error {
	b, _ := json.Marshal(target)
	_, err := tx.Exec(ctx, `INSERT INTO platform_directory.audit(action,target,reason) VALUES($1,$2,$3)`, action, b, reason)
	return err
}
