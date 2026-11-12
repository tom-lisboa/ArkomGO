package application

import (
	"encoding/json"
	"strings"
	"testing"
)

const example = `{"schema_version":"arkom.application.v1","catalog_version":"arkom-capabilities-v1","name":"Calculadora","backend":"go","entrypoint":"frontend/index.html","routes":[{"method":"POST","path":"/api/calculate","operation_id":"calculate"}],"capabilities":[]}`

func TestManifestStrictDecoding(t *testing.T) {
	for name, raw := range map[string]string{
		"case alias":           strings.Replace(example, `"name"`, `"Name"`, 1),
		"unknown field":        strings.Replace(example, `"backend":"go"`, `"backend":"go","token":"secret"`, 1),
		"identity injection":   strings.Replace(example, `"backend":"go"`, `"backend":"go","application_id":"app_other"`, 1),
		"duplicate key":        strings.Replace(example, `"backend":"go"`, `"backend":"go","backend":"go"`, 1),
		"nested duplicate":     strings.Replace(example, `"method":"POST"`, `"method":"POST","method":"GET"`, 1),
		"unknown route field":  strings.Replace(example, `"method":"POST"`, `"method":"POST","url":"https://example.com"`, 1),
		"trailing value":       example + `{}`,
		"null routes":          strings.Replace(example, `[{"method":"POST","path":"/api/calculate","operation_id":"calculate"}]`, `null`, 1),
		"missing capabilities": strings.Replace(example, `,"capabilities":[]`, ``, 1),
		"too large":            strings.Repeat(" ", MaxManifestBytes) + example,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Decode(raw); err == nil {
				t.Fatal("accepted invalid declaration")
			}
		})
	}
}
func TestManifestConstraints(t *testing.T) {
	tests := map[string]func(*Manifest){
		"schema":               func(m *Manifest) { m.SchemaVersion = "v2" },
		"catalog":              func(m *Manifest) { m.CatalogVersion = "invented" },
		"name":                 func(m *Manifest) { m.Name = "bad\nname" },
		"backend":              func(m *Manifest) { m.Backend = "python" },
		"entrypoint":           func(m *Manifest) { m.Entrypoint = "../index.html" },
		"capability":           func(m *Manifest) { m.Capabilities = []string{"finance.invented.v1"} },
		"duplicate capability": func(m *Manifest) { m.Capabilities = []string{"crm.opportunity.v1", "crm.opportunity.v1"} },
		"method":               func(m *Manifest) { m.Routes[0].Method = "TRACE" },
		"operation":            func(m *Manifest) { m.Routes[0].OperationID = "a b" },
		"duplicate operation":  func(m *Manifest) { m.Routes = append(m.Routes, Route{"GET", "/api/history", "calculate"}) },
		"ambiguous route": func(m *Manifest) {
			m.Routes = []Route{{"GET", "/api/lots/{id}", "one"}, {"GET", "/api/lots/{lot}", "two"}}
		},
		"overlapping route": func(m *Manifest) {
			m.Routes = []Route{{"GET", "/api/lots/{id}", "one"}, {"GET", "/api/{kind}/recent", "two"}}
		},
		"too many routes": func(m *Manifest) { m.Routes = make([]Route, 33) },
	}
	for name, edit := range tests {
		t.Run(name, func(t *testing.T) {
			m, _ := Decode(example)
			edit(&m)
			raw, _ := json.Marshal(m)
			if _, err := Decode(string(raw)); err == nil {
				t.Fatal("accepted invalid manifest")
			}
		})
	}
	for _, path := range []string{"https://host/api/x", "/api/a/../b", "/api/%2e", "/api//x", "/api/x?y=1", "/api/x/", "/api/{rest...}", "/api/{id}/{id}", "/v1/x", "/api/"} {
		m, _ := Decode(example)
		m.Routes[0].Path = path
		if err := m.Validate(); err == nil {
			t.Fatalf("accepted %q", path)
		}
	}
	m, _ := Decode(example)
	m.Routes = append(m.Routes, Route{"GET", "/api/history/{id}", "history"})
	m.Capabilities = []string{"crm.opportunity.v1"}
	if err := m.Validate(); err != nil {
		t.Fatal(err)
	}
}
func TestSealBindsIdentityRevisionAndSource(t *testing.T) {
	files := map[string]string{ManifestPath: example, "frontend/index.html": "<h1>Calculator</h1>", "backend/go.mod": "module arkom.local/solution\n\ngo 1.24.0\n", "backend/main.go": "package solution"}
	c, err := Seal("app_test", 1, files)
	if err != nil {
		t.Fatal(err)
	}
	if !c.Matches("app_test", 1, files) || c.Matches("app_other", 1, files) || c.Matches("app_test", 2, files) {
		t.Fatal("identity binding")
	}
	c.Manifest.Name = "Tampered"
	if c.Matches("app_test", 1, files) {
		t.Fatal("manifest binding")
	}
	c.Manifest.Name = "Calculadora"
	files["backend/main.go"] += "\n// changed"
	if c.Matches("app_test", 1, files) {
		t.Fatal("source binding")
	}
	delete(files, "frontend/index.html")
	if _, err := Seal("app_test", 1, files); err == nil {
		t.Fatal("missing entrypoint")
	}
}
