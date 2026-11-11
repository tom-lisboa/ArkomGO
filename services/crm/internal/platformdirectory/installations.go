package platformdirectory

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"
	access "github.com/tom-lisboa/CRMGO/pkg/platformaccess"
)

type InstallationInput struct {
	Key                   string `json:"idempotency_key"`
	OrganizationID        string `json:"organization_id"`
	Backend               string `json:"backend"`
	Solution              string `json:"solution"`
	Origin                string `json:"origin"`
	APIURL                string `json:"api_url"`
	SourceReference       string `json:"source_reference"`
	VerificationReference string `json:"verification_reference"`
}
type Installation struct {
	ID             string `json:"installation_id"`
	OrganizationID string `json:"organization_id"`
	Backend        string `json:"backend"`
	Solution       string `json:"solution"`
	Origin         string `json:"origin"`
	APIURL         string `json:"api_url"`
	Revision       int64  `json:"revision"`
}
type PublicInstallation struct {
	ID           string `json:"installation_id"`
	Solution     string `json:"solution"`
	Origin       string `json:"origin"`
	APIURL       string `json:"api_url"`
	CallbackPath string `json:"callback_path"`
}

func ValidOrigin(value string, allowLoopback bool) bool {
	u, err := url.Parse(value)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.ToLower(u.Host) != u.Host || u.Opaque != "" {
		return false
	}
	loopback := u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1" || strings.HasSuffix(u.Hostname(), ".localhost")
	if loopback {
		return allowLoopback && (u.Scheme == "https" || u.Scheme == "http")
	}
	if u.Scheme != "https" || u.Port() != "" || strings.HasSuffix(u.Host, ".") || !strings.Contains(u.Host, ".") {
		return false
	}
	for _, r := range u.Host {
		if !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '.' && r != '-' {
			return false
		}
	}
	return u.String() == value
}

// The operator/integrator must verify ownership first. This is never a public
// self-registration endpoint and does not claim to verify Lovable ownership.
func (s Store) RegisterInstallation(ctx context.Context, in InstallationInput, allowLoopback bool) (Installation, error) {
	var out Installation
	if !access.ValidReference(in.Key) || !access.ValidID(in.OrganizationID) || !access.ValidReference(in.Backend) || !access.ValidSolution(in.Solution) || !ValidOrigin(in.Origin, allowLoopback) || !ValidOrigin(in.APIURL, allowLoopback) || !access.ValidReference(in.SourceReference) || !access.ValidReference(in.VerificationReference) {
		return out, ErrInvalid
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,4822))`, in.Origin); err != nil {
		return out, err
	}
	key := "installation:" + in.Key
	var oldHash string
	var raw []byte
	err = tx.QueryRow(ctx, `SELECT fingerprint,response FROM platform_directory.requests WHERE namespace='installations' AND key=$1`, key).Scan(&oldHash, &raw)
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
	var active bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM platform_directory.backend_organizations bo
 JOIN platform_directory.organizations o ON o.id=bo.organization_id JOIN platform_directory.customers c ON c.id=o.customer_id
 JOIN platform_directory.entitlements e ON e.organization_id=o.id AND e.solution=bo.solution
 JOIN public.platform_organizations po ON po.id=o.id
 WHERE bo.backend=$1 AND bo.solution=$2 AND o.id=$3 AND o.enabled AND po.enabled AND c.enabled AND e.enabled)`, in.Backend, in.Solution, in.OrganizationID).Scan(&active)
	if err != nil {
		return out, err
	}
	if !active {
		return out, access.ErrDenied
	}
	var origin string
	err = tx.QueryRow(ctx, `INSERT INTO platform_directory.installation_origins(origin,organization_id,verification_reference) VALUES($1,$2,$3)
 ON CONFLICT(origin) DO UPDATE SET origin=excluded.origin
 WHERE platform_directory.installation_origins.organization_id=excluded.organization_id RETURNING origin`, in.Origin, in.OrganizationID, in.VerificationReference).Scan(&origin)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrConflict
	}
	if err != nil {
		return out, err
	}
	var endpoint string
	err = tx.QueryRow(ctx, `INSERT INTO platform_directory.backend_endpoints(backend,api_url) VALUES($1,$2)
 ON CONFLICT(backend) DO UPDATE SET backend=excluded.backend WHERE platform_directory.backend_endpoints.api_url=excluded.api_url RETURNING api_url`, in.Backend, in.APIURL).Scan(&endpoint)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrConflict
	}
	if err != nil {
		return out, err
	}
	out = Installation{OrganizationID: in.OrganizationID, Backend: in.Backend, Solution: in.Solution, Origin: in.Origin, APIURL: in.APIURL}
	err = tx.QueryRow(ctx, `INSERT INTO platform_directory.installations(organization_id,backend,solution,origin,source_reference) VALUES($1,$2,$3,$4,$5) RETURNING id::text,revision`, in.OrganizationID, in.Backend, in.Solution, in.Origin, in.SourceReference).Scan(&out.ID, &out.Revision)
	if err != nil {
		return out, conflict(err)
	}
	raw, _ = json.Marshal(out)
	if _, err = tx.Exec(ctx, `INSERT INTO platform_directory.requests(namespace,key,fingerprint,response) VALUES('installations',$1,$2,$3)`, key, fingerprint(in), raw); err != nil {
		return out, err
	}
	if err = audit(ctx, tx, "installation.registered", map[string]string{"installation_id": out.ID, "organization_id": out.OrganizationID, "backend": out.Backend}, in.VerificationReference); err != nil {
		return out, err
	}
	return out, tx.Commit(ctx)
}

func (s Store) Installation(ctx context.Context, id string) (Installation, error) {
	return InstallationQuery(ctx, s.DB, id)
}
func InstallationQuery(ctx context.Context, q RowQuerier, id string) (Installation, error) {
	var out Installation
	if !access.ValidID(id) {
		return out, access.ErrDenied
	}
	err := q.QueryRow(ctx, `SELECT i.id::text,i.organization_id::text,i.backend,i.solution,i.origin,be.api_url,i.revision
 FROM platform_directory.installations i JOIN platform_directory.backend_endpoints be ON be.backend=i.backend
 JOIN platform_directory.organizations o ON o.id=i.organization_id JOIN platform_directory.customers c ON c.id=o.customer_id
 JOIN public.platform_organizations po ON po.id=o.id JOIN platform_directory.entitlements e ON e.organization_id=o.id AND e.solution=i.solution
 WHERE i.id=$1 AND i.enabled AND o.enabled AND c.enabled AND po.enabled AND e.enabled`, id).Scan(&out.ID, &out.OrganizationID, &out.Backend, &out.Solution, &out.Origin, &out.APIURL, &out.Revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, access.ErrDenied
	}
	return out, err
}

func (i Installation) Public() PublicInstallation {
	return PublicInstallation{ID: i.ID, Solution: i.Solution, Origin: i.Origin, APIURL: i.APIURL, CallbackPath: "/login"}
}
