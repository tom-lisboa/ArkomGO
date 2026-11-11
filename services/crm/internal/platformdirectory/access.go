package platformdirectory

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	access "github.com/tom-lisboa/CRMGO/pkg/platformaccess"
)

type RowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (s Store) ResolveLocal(ctx context.Context, backend, solution, localOrg, actor string) (access.Principal, error) {
	return ResolveLocalQuery(ctx, s.DB, backend, solution, localOrg, actor)
}

func ResolveLocalQuery(ctx context.Context, q RowQuerier, backend, solution, localOrg, actor string) (access.Principal, error) {
	var p access.Principal
	if !access.ValidReference(backend) || !access.ValidSolution(solution) || !access.ValidReference(localOrg) || !access.ValidReference(actor) {
		return p, access.ErrDenied
	}
	err := q.QueryRow(ctx, `SELECT c.id::text,o.id::text,p.id::text,b.solution,b.backend,bo.local_organization_id,b.local_actor_id,g.role
 FROM platform_directory.bindings b
 JOIN platform_directory.backend_organizations bo ON bo.backend=b.backend AND bo.organization_id=b.organization_id AND bo.solution=b.solution
 JOIN platform_directory.organizations o ON o.id=b.organization_id
 JOIN public.platform_organizations po ON po.id=o.id
 JOIN platform_directory.customers c ON c.id=o.customer_id
 JOIN platform_directory.people p ON p.id=b.person_id
 JOIN platform_directory.memberships m ON m.organization_id=o.id AND m.person_id=p.id
 JOIN platform_directory.entitlements e ON e.organization_id=o.id AND e.solution=b.solution
 JOIN platform_directory.grants g ON g.organization_id=o.id AND g.person_id=p.id AND g.solution=b.solution
 WHERE b.backend=$1 AND b.solution=$2 AND bo.local_organization_id=$3 AND b.local_actor_id=$4
 AND c.enabled AND o.enabled AND po.enabled AND p.enabled AND m.enabled AND e.enabled AND g.enabled`, backend, solution, localOrg, actor).Scan(
		&p.CustomerID, &p.OrganizationID, &p.PersonID, &p.Solution, &p.Backend, &p.LocalOrganizationID, &p.LocalActorID, &p.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, access.ErrDenied
	}
	return p, err
}

// BindService is operator-only, requires an already scoped service credential,
// and cannot move that credential to a different backend on a repeat call.
func (s Store) BindService(ctx context.Context, clientID, backend string) error {
	if !access.ValidID(clientID) || !access.ValidReference(backend) {
		return ErrInvalid
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var bound string
	err = tx.QueryRow(ctx, `INSERT INTO platform_directory.service_bindings(client_id,backend)
 SELECT c.id,b.id FROM public.integration_clients c JOIN platform_directory.backends b ON b.solution=c.solution
 WHERE c.id=$1 AND b.id=$2 AND c.enabled
 AND EXISTS(SELECT 1 FROM public.integration_grants g JOIN platform_directory.backend_organizations bo ON bo.organization_id=g.organization_id AND bo.backend=b.id WHERE g.client_id=c.id)
 ON CONFLICT(client_id) DO UPDATE SET backend=excluded.backend
 WHERE platform_directory.service_bindings.backend=excluded.backend RETURNING backend`, clientID, backend).Scan(&bound)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if err = audit(ctx, tx, "service.bound", map[string]string{"client_id": clientID, "backend": backend}, "verified operator binding"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s Store) ResolveService(ctx context.Context, clientID, org, solution string, in access.LocalIdentity) (access.Principal, error) {
	var allowed bool
	err := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM platform_directory.service_bindings sb
 JOIN public.integration_clients c ON c.id=sb.client_id
 JOIN public.integration_grants g ON g.client_id=c.id AND g.organization_id=$2 AND g.source_solution=c.solution AND g.can_read
 WHERE sb.client_id=$1 AND sb.backend=$3 AND c.solution=$4 AND c.enabled)`, clientID, org, in.Backend, solution).Scan(&allowed)
	if err != nil {
		return access.Principal{}, err
	}
	if !allowed {
		return access.Principal{}, access.ErrDenied
	}
	p, err := s.ResolveLocal(ctx, in.Backend, solution, in.OrganizationID, in.ActorID)
	if err != nil {
		return p, err
	}
	if p.OrganizationID != org {
		return access.Principal{}, access.ErrDenied
	}
	return p, nil
}

// ServiceActive also applies customer/product revocation to event consumers,
// without granting them any end-user permission.
func (s Store) ServiceActive(ctx context.Context, clientID, org, solution string) error {
	var allowed bool
	err := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM platform_directory.service_bindings sb
 JOIN public.integration_clients ic ON ic.id=sb.client_id
 JOIN platform_directory.backend_organizations bo ON bo.backend=sb.backend AND bo.organization_id=$2 AND bo.solution=$3
 JOIN platform_directory.organizations o ON o.id=bo.organization_id
 JOIN platform_directory.customers c ON c.id=o.customer_id
 JOIN platform_directory.entitlements e ON e.organization_id=o.id AND e.solution=bo.solution
 WHERE sb.client_id=$1 AND ic.solution=$3 AND ic.enabled AND o.enabled AND c.enabled AND e.enabled)`, clientID, org, solution).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return access.ErrDenied
	}
	return nil
}

type Change struct {
	Kind             string `json:"kind"`
	ID               string `json:"id,omitempty"`
	OrganizationID   string `json:"organization_id,omitempty"`
	PersonID         string `json:"person_id,omitempty"`
	Solution         string `json:"solution,omitempty"`
	Enabled          bool   `json:"enabled"`
	Role             string `json:"role,omitempty"`
	ExpectedRevision int64  `json:"expected_revision"`
	Reason           string `json:"reason"`
}

// Change updates one explicit target with optimistic concurrency, never a
// matching email/name. Administrative writes are not exposed over public HTTP.
func (s Store) Change(ctx context.Context, c Change) (int64, error) {
	if c.ExpectedRevision < 1 || !validName(c.Reason) {
		return 0, ErrInvalid
	}
	var query string
	var args []any
	switch c.Kind {
	case "customer", "person", "organization", "installation":
		if !access.ValidID(c.ID) || c.OrganizationID != "" || c.PersonID != "" || c.Solution != "" || c.Role != "" {
			return 0, ErrInvalid
		}
		table := map[string]string{"customer": "customers", "person": "people", "organization": "organizations", "installation": "installations"}[c.Kind]
		query = `UPDATE platform_directory.` + table + ` SET enabled=$2,revision=revision+1 WHERE id=$1 AND revision=$3 RETURNING revision`
		args = []any{c.ID, c.Enabled, c.ExpectedRevision}
	case "membership":
		if !access.ValidID(c.OrganizationID) || !access.ValidID(c.PersonID) || c.ID != "" || c.Solution != "" || c.Role != "" {
			return 0, ErrInvalid
		}
		query = `UPDATE platform_directory.memberships SET enabled=$3,revision=revision+1 WHERE organization_id=$1 AND person_id=$2 AND revision=$4 RETURNING revision`
		args = []any{c.OrganizationID, c.PersonID, c.Enabled, c.ExpectedRevision}
	case "entitlement":
		if !access.ValidID(c.OrganizationID) || !access.ValidSolution(c.Solution) || c.ID != "" || c.PersonID != "" || c.Role != "" {
			return 0, ErrInvalid
		}
		query = `UPDATE platform_directory.entitlements SET enabled=$3,revision=revision+1 WHERE organization_id=$1 AND solution=$2 AND revision=$4 RETURNING revision`
		args = []any{c.OrganizationID, c.Solution, c.Enabled, c.ExpectedRevision}
	case "grant":
		if !access.ValidID(c.OrganizationID) || !access.ValidID(c.PersonID) || !access.ValidSolution(c.Solution) || access.RoleRank(c.Role) == 0 || c.ID != "" {
			return 0, ErrInvalid
		}
		query = `UPDATE platform_directory.grants SET enabled=$4,role=$5,revision=revision+1 WHERE organization_id=$1 AND person_id=$2 AND solution=$3 AND revision=$6 RETURNING revision`
		args = []any{c.OrganizationID, c.PersonID, c.Solution, c.Enabled, c.Role, c.ExpectedRevision}
	default:
		return 0, ErrInvalid
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var revision int64
	err = tx.QueryRow(ctx, query, args...).Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrConflict
	}
	if err != nil {
		return 0, err
	}
	if err = audit(ctx, tx, c.Kind+".changed", map[string]any{"id": c.ID, "organization_id": c.OrganizationID, "person_id": c.PersonID, "solution": c.Solution, "enabled": c.Enabled, "role": c.Role, "revision": revision}, c.Reason); err != nil {
		return 0, err
	}
	return revision, tx.Commit(ctx)
}
