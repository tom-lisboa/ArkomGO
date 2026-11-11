package platformaccess

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Credential struct {
	OrganizationID      string `json:"organization_id"`
	LocalOrganizationID string `json:"local_organization_id"`
	Token               string `json:"token"`
}
type Configuration struct {
	URL           string       `json:"url"`
	Backend       string       `json:"backend"`
	Solution      string       `json:"solution"`
	Organizations []Credential `json:"organizations"`
}
type Client struct {
	config      Configuration
	credentials map[string]Credential
	http        *http.Client
}

func New(config Configuration) (*Client, error) {
	u, err := url.Parse(config.URL)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" ||
		(u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost" || u.Hostname() == "::1"))) ||
		!ValidReference(config.Backend) || !ValidSolution(config.Solution) || len(config.Organizations) < 1 || len(config.Organizations) > 1000 {
		return nil, ErrUnavailable
	}
	c := &Client{config: config, credentials: map[string]Credential{}, http: &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	for _, v := range config.Organizations {
		if !ValidID(v.OrganizationID) || !ValidReference(v.LocalOrganizationID) || !strings.HasPrefix(v.Token, "arkom_service_") || len(v.Token) != 57 {
			return nil, ErrUnavailable
		}
		if _, exists := c.credentials[v.LocalOrganizationID]; exists {
			return nil, ErrUnavailable
		}
		c.credentials[v.LocalOrganizationID] = v
	}
	return c, nil
}

// FromFile loads a server-only credential file. An empty path explicitly leaves
// adoption disabled; a present but invalid configuration never falls back.
func FromFile(path, solution string) (*Client, error) {
	if path == "" {
		return nil, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 256<<10 {
		return nil, ErrUnavailable
	}
	var config Configuration
	d := json.NewDecoder(io.LimitReader(f, 256<<10))
	d.DisallowUnknownFields()
	if d.Decode(&config) != nil || d.Decode(new(any)) != io.EOF || config.Solution != solution {
		return nil, ErrUnavailable
	}
	return New(config)
}

func (c *Client) Resolve(ctx context.Context, localOrg, actor string) (Principal, error) {
	var out Principal
	credential, ok := c.credentials[localOrg]
	if !ok || !ValidReference(actor) {
		return out, ErrDenied
	}
	in := LocalIdentity{Backend: c.config.Backend, OrganizationID: localOrg, ActorID: actor}
	body, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, "POST", c.config.URL+"/integration/v1/identity/"+c.config.Solution+"/resolve", bytes.NewReader(body))
	if err != nil {
		return out, ErrUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+credential.Token)
	req.Header.Set("X-Organization-ID", credential.OrganizationID)
	res, err := c.http.Do(req)
	if err != nil {
		return out, ErrUnavailable
	}
	defer res.Body.Close()
	if res.StatusCode == 401 || res.StatusCode == 403 || res.StatusCode == 404 {
		return out, ErrDenied
	}
	if res.StatusCode != 200 {
		return out, ErrUnavailable
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 8193))
	if err != nil || len(raw) > 8192 {
		return out, ErrUnavailable
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(&out) != nil || d.Decode(new(any)) != io.EOF || !ValidID(out.CustomerID) || !ValidID(out.PersonID) || out.OrganizationID != credential.OrganizationID ||
		out.Backend != c.config.Backend || out.Solution != c.config.Solution || out.LocalOrganizationID != localOrg || out.LocalActorID != actor || RoleRank(out.Role) == 0 {
		return Principal{}, ErrUnavailable
	}
	return out, nil
}
