// Package platformaccess defines the shared identity boundary. It never accepts
// a browser's claim of organization or person as proof of authentication.
package platformaccess

import (
	"context"
	"errors"
	"regexp"
)

var ErrDenied = errors.New("platform_access_denied")
var ErrUnavailable = errors.New("platform_directory_unavailable")
var uuid = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var ref = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

func ValidID(v string) bool        { return uuid.MatchString(v) }
func ValidReference(v string) bool { return ref.MatchString(v) }
func ValidSolution(v string) bool {
	return v == "clips" || v == "social" || v == "finance" || v == "bia-sdr"
}
func RoleRank(v string) int {
	switch v {
	case "viewer":
		return 1
	case "operator":
		return 2
	case "admin":
		return 3
	}
	return 0
}

type Principal struct {
	CustomerID          string `json:"customer_id"`
	OrganizationID      string `json:"organization_id"`
	PersonID            string `json:"person_id"`
	Solution            string `json:"solution"`
	Backend             string `json:"backend"`
	LocalOrganizationID string `json:"local_organization_id"`
	LocalActorID        string `json:"local_actor_id"`
	Role                string `json:"role"`
}

type LocalIdentity struct {
	Backend        string `json:"backend"`
	OrganizationID string `json:"local_organization_id"`
	ActorID        string `json:"local_actor_id"`
}

type Resolver interface {
	Resolve(context.Context, string, string) (Principal, error)
}

// Ceiling intersects roles. A directory grant cannot promote a local user.
// Product-specific permissions must still be evaluated by the product.
func Ceiling(local, common string) (string, error) {
	if RoleRank(local) == 0 || RoleRank(common) == 0 {
		return "", ErrDenied
	}
	if RoleRank(common) < RoleRank(local) {
		return common, nil
	}
	return local, nil
}
