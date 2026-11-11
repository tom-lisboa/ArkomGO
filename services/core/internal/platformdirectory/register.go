package platformdirectory

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Register is operator-only. References must come from a verified integration;
// an email address, company name or browser-supplied ID is never matched here.
func (s Store) Register(ctx context.Context, in Registration) (Registered, error) {
	var out Registered
	if err := in.validate(); err != nil {
		return out, err
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	// Serializes first registrations and person reuse within the issuing namespace.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,4821))`, in.Namespace); err != nil {
		return out, err
	}
	var oldHash string
	var raw []byte
	err = tx.QueryRow(ctx, `SELECT fingerprint,response FROM platform_directory.requests WHERE namespace=$1 AND key=$2`, in.Namespace, in.Key).Scan(&oldHash, &raw)
	if err == nil {
		if oldHash != fingerprint(in) {
			return out, ErrConflict
		}
		if err = json.Unmarshal(raw, &out); err != nil {
			return out, err
		}
		return out, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO platform_directory.customers(namespace,reference,name) VALUES($1,$2,$3)
 ON CONFLICT(namespace,reference) DO UPDATE SET reference=excluded.reference
 WHERE platform_directory.customers.enabled RETURNING id::text`, in.Namespace, in.CustomerReference, in.Name).Scan(&out.CustomerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrConflict
	}
	if err != nil {
		return out, conflict(err)
	}
	if in.ExistingOrganizationID != "" {
		err = tx.QueryRow(ctx, `SELECT id::text FROM public.platform_organizations WHERE id=$1 AND enabled FOR UPDATE`, in.ExistingOrganizationID).Scan(&out.OrganizationID)
	} else {
		err = tx.QueryRow(ctx, `WITH v AS(SELECT gen_random_uuid() AS id) INSERT INTO public.platform_organizations(id,slug,name)
 SELECT id,'directory-'||id::text,$1 FROM v RETURNING id::text`, in.Name).Scan(&out.OrganizationID)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrConflict
	}
	if err != nil {
		return out, conflict(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO platform_directory.organizations(id,customer_id,namespace,reference) VALUES($1,$2,$3,$4)`, out.OrganizationID, out.CustomerID, in.Namespace, in.OrganizationReference)
	if err != nil {
		return out, conflict(err)
	}
	out.People = map[string]string{}
	for _, member := range in.Members {
		var id string
		err = tx.QueryRow(ctx, `SELECT p.id::text FROM platform_directory.identities i JOIN platform_directory.people p ON p.id=i.person_id
 WHERE i.namespace=$1 AND i.subject=$2 AND p.enabled`, in.Namespace, member.Reference).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			if err = tx.QueryRow(ctx, `INSERT INTO platform_directory.people(name) VALUES($1) RETURNING id::text`, member.Name).Scan(&id); err != nil {
				return out, err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO platform_directory.identities(namespace,subject,person_id) VALUES($1,$2,$3)`, in.Namespace, member.Reference, id); err != nil {
				return out, conflict(err)
			}
		} else if err != nil {
			return out, err
		}
		out.People[member.Reference] = id
		if _, err = tx.Exec(ctx, `INSERT INTO platform_directory.memberships(organization_id,person_id) VALUES($1,$2)`, out.OrganizationID, id); err != nil {
			return out, err
		}
	}
	for _, product := range in.Products {
		var backend string
		err = tx.QueryRow(ctx, `INSERT INTO platform_directory.backends(id,solution) VALUES($1,$2)
 ON CONFLICT(id) DO UPDATE SET id=excluded.id WHERE platform_directory.backends.solution=excluded.solution RETURNING id`, product.Backend, product.Solution).Scan(&backend)
		if errors.Is(err, pgx.ErrNoRows) {
			return out, ErrConflict
		}
		if err != nil {
			return out, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO platform_directory.entitlements(organization_id,solution) VALUES($1,$2)`, out.OrganizationID, product.Solution)
		if err != nil {
			return out, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO platform_directory.backend_organizations(backend,solution,organization_id,local_organization_id) VALUES($1,$2,$3,$4)`, backend, product.Solution, out.OrganizationID, product.LocalOrganizationID)
		if err != nil {
			return out, conflict(err)
		}
		for _, grant := range product.Grants {
			person := out.People[grant.PersonReference]
			_, err = tx.Exec(ctx, `INSERT INTO platform_directory.grants(organization_id,person_id,solution,role) VALUES($1,$2,$3,$4)`, out.OrganizationID, person, product.Solution, grant.Role)
			if err != nil {
				return out, err
			}
			_, err = tx.Exec(ctx, `INSERT INTO platform_directory.bindings(backend,organization_id,solution,local_actor_id,person_id) VALUES($1,$2,$3,$4,$5)`, backend, out.OrganizationID, product.Solution, grant.LocalActorID, person)
			if err != nil {
				return out, conflict(err)
			}
		}
	}
	raw, err = json.Marshal(out)
	if err != nil {
		return out, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO platform_directory.requests(namespace,key,fingerprint,response) VALUES($1,$2,$3,$4)`, in.Namespace, in.Key, fingerprint(in), raw); err != nil {
		return out, err
	}
	if err = audit(ctx, tx, "organization.registered", map[string]string{"customer_id": out.CustomerID, "organization_id": out.OrganizationID}, "verified operator registration"); err != nil {
		return out, err
	}
	return out, tx.Commit(ctx)
}
