// Package application defines the versioned contract of a generated Arkom app.
// A declaration requests capabilities; it never grants access or starts a service.
package application

import (
	"bytes"
	"crypto/sha256"
	"deeph/pkg/arkom"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"unicode"
)

const SchemaVersion = "arkom.application.v1"
const ManifestPath = "application.json"
const MaxManifestBytes = 16000

//go:embed contract.md
var Reference string

type Route struct {
	Method      string `json:"method"`
	Path        string `json:"path"`
	OperationID string `json:"operation_id"`
}
type Manifest struct {
	SchemaVersion  string   `json:"schema_version"`
	CatalogVersion string   `json:"catalog_version"`
	Name           string   `json:"name"`
	Backend        string   `json:"backend"`
	Entrypoint     string   `json:"entrypoint"`
	Routes         []Route  `json:"routes"`
	Capabilities   []string `json:"capabilities"`
}

// Contract binds a validated declaration to an immutable build snapshot.
// Identity and revision come from the host, never from generated source.
type Contract struct {
	ApplicationID string   `json:"application_id"`
	Revision      int      `json:"revision"`
	Manifest      Manifest `json:"manifest"`
	SourceDigest  string   `json:"source_digest"`
}

var identifier = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
var segment = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
var appID = regexp.MustCompile(`^app_[a-zA-Z0-9_-]{1,100}$`)

func Decode(raw string) (Manifest, error) {
	var m Manifest
	if len(raw) == 0 || len(raw) > MaxManifestBytes {
		return m, errors.New("manifest_missing_or_too_large")
	}
	// Duplicate keys are ambiguous to consumers; reject before typed decoding.
	d := json.NewDecoder(strings.NewReader(raw))
	if err := uniqueValue(d, 0); err != nil {
		return m, errors.New("manifest_invalid_json")
	}
	if _, err := d.Token(); err != io.EOF {
		return m, errors.New("manifest_trailing_json")
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &fields) != nil || !exactFields(fields, "schema_version", "catalog_version", "name", "backend", "entrypoint", "routes", "capabilities") {
		return m, errors.New("manifest_fields_required")
	}
	var routes []map[string]json.RawMessage
	if json.Unmarshal(fields["routes"], &routes) != nil {
		return m, errors.New("invalid_routes")
	}
	for _, route := range routes {
		if !exactFields(route, "method", "path", "operation_id") {
			return m, errors.New("route_fields_required")
		}
	}
	d = json.NewDecoder(strings.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&m); err != nil {
		return Manifest{}, errors.New("manifest_unknown_field_or_type")
	}
	if err := m.Validate(); err != nil {
		return Manifest{}, err
	}
	return m, nil
}

func uniqueValue(d *json.Decoder, depth int) error {
	if depth > 12 {
		return errors.New("json_depth")
	}
	t, err := d.Token()
	if err != nil {
		return err
	}
	if delim, ok := t.(json.Delim); ok {
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				k, err := d.Token()
				if err != nil {
					return err
				}
				key, ok := k.(string)
				if !ok || seen[key] {
					return errors.New("duplicate_key")
				}
				seen[key] = true
				if err := uniqueValue(d, depth+1); err != nil {
					return err
				}
			}
		case '[':
			for d.More() {
				if err := uniqueValue(d, depth+1); err != nil {
					return err
				}
			}
		default:
			return errors.New("invalid_delimiter")
		}
		_, err = d.Token()
	}
	return err
}

func (m Manifest) Validate() error {
	if m.SchemaVersion != SchemaVersion {
		return errors.New("unsupported_manifest_version")
	}
	if m.CatalogVersion != arkom.CatalogVersion {
		return errors.New("unsupported_catalog_version")
	}
	if strings.TrimSpace(m.Name) != m.Name || len([]rune(m.Name)) < 1 || len([]rune(m.Name)) > 100 || strings.IndexFunc(m.Name, unicode.IsControl) >= 0 {
		return errors.New("invalid_application_name")
	}
	if m.Backend != "go" || m.Entrypoint != "frontend/index.html" {
		return errors.New("unsupported_application_target")
	}
	if m.Routes == nil || len(m.Routes) > 32 || m.Capabilities == nil || len(m.Capabilities) > 16 {
		return errors.New("invalid_manifest_collections")
	}
	mux := http.NewServeMux()
	operations := map[string]bool{}
	for _, r := range m.Routes {
		if !identifier.MatchString(r.OperationID) || operations[r.OperationID] {
			return errors.New("invalid_or_duplicate_operation")
		}
		operations[r.OperationID] = true
		switch r.Method {
		case "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS":
		default:
			return errors.New("invalid_route_method")
		}
		if !validPath(r.Path) {
			return errors.New("invalid_route_path")
		}
		if !register(mux, r.Method+" "+r.Path) {
			return errors.New("conflicting_routes")
		}
	}
	var catalog struct {
		Capabilities []struct {
			ID string `json:"id"`
		} `json:"capabilities"`
	}
	if json.Unmarshal([]byte(arkom.Catalog), &catalog) != nil {
		return errors.New("catalog_unavailable")
	}
	known := map[string]bool{}
	for _, c := range catalog.Capabilities {
		known[c.ID] = true
	}
	seen := map[string]bool{}
	for _, c := range m.Capabilities {
		if !known[c] || seen[c] {
			return errors.New("unknown_or_duplicate_capability")
		}
		seen[c] = true
	}
	return nil
}
func validPath(p string) bool {
	if len(p) > 160 || !strings.HasPrefix(p, "/api/") {
		return false
	}
	for _, s := range strings.Split(strings.TrimPrefix(p, "/api/"), "/") {
		if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
			if !identifier.MatchString(s[1 : len(s)-1]) {
				return false
			}
		} else if !segment.MatchString(s) {
			return false
		}
	}
	return true
}
func register(mux *http.ServeMux, pattern string) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	mux.HandleFunc(pattern, func(http.ResponseWriter, *http.Request) {})
	return true
}

// ValidateFiles checks artifact presence, not runtime behavior or authorization.
func ValidateFiles(files map[string]string) (Manifest, error) {
	m, err := Decode(files[ManifestPath])
	if err != nil {
		return m, err
	}
	if strings.TrimSpace(files[m.Entrypoint]) == "" {
		return Manifest{}, errors.New("missing_frontend_entrypoint")
	}
	if files["backend/go.mod"] != "module arkom.local/solution\n\ngo 1.24.0\n" {
		return Manifest{}, errors.New("invalid_backend_module")
	}
	return m, nil
}
func Seal(id string, revision int, files map[string]string) (*Contract, error) {
	if !appID.MatchString(id) || revision < 1 {
		return nil, errors.New("invalid_host_identity")
	}
	m, err := ValidateFiles(files)
	if err != nil {
		return nil, err
	}
	return &Contract{ApplicationID: id, Revision: revision, Manifest: m, SourceDigest: Digest(files)}, nil
}
func Digest(files map[string]string) string {
	raw, _ := json.Marshal(files) // encoding/json sorts map keys.
	return fmt.Sprintf("sha256:%x", sha256.Sum256(raw))
}
func (c *Contract) Matches(id string, revision int, files map[string]string) bool {
	expected, err := Seal(id, revision, files)
	if err != nil || c == nil {
		return false
	}
	a, _ := json.Marshal(c)
	b, _ := json.Marshal(expected)
	return bytes.Equal(a, b)
}

func exactFields(fields map[string]json.RawMessage, names ...string) bool {
	if len(fields) != len(names) {
		return false
	}
	for _, name := range names {
		if _, ok := fields[name]; !ok {
			return false
		}
	}
	return true
}
