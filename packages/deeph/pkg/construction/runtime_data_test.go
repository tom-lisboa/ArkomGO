package construction

import (
	"context"
	"encoding/json"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRuntimeDataWireIsHostOwnedAndPreservesJSONNull(t *testing.T) {
	in := RuntimeRequest{Method: "GET", Path: "/api/data", Data: &DataSnapshot{Found: true, Value: json.RawMessage(`null`)}}
	public, _ := json.Marshal(in)
	if strings.Contains(string(public), `"data"`) {
		t.Fatal("host snapshot leaked into public request", string(public))
	}
	wire, _ := json.Marshal(runtimeWireRequest(in))
	if !strings.Contains(string(wire), `"value":null`) {
		t.Fatal("null document lost", string(wire))
	}
	var reply RuntimeReply
	if err := json.Unmarshal([]byte(`{"status":200,"body":"ok","data_write":{"value":null}}`), &reply); err != nil || reply.DataWrite == nil || string(reply.DataWrite.Value) != "null" || !ValidData(reply.DataWrite.Value) {
		t.Fatal("null write confused with no mutation", reply, err)
	}
	if ValidData(json.RawMessage(`{`)) || ValidData(json.RawMessage(`"`+strings.Repeat("a", MaxDataBytes)+`"`)) {
		t.Fatal("invalid or oversized data accepted")
	}
}
func TestRuntimeDataKeepsLegacyAdaptersAndRejectsModifiedContract(t *testing.T) {
	files := Seed()
	delete(files, DataContractPath)
	dir := t.TempDir()
	if err := writeRuntimeAdapter(dir, files); err != nil {
		t.Fatal(err)
	}
	legacy, _ := os.ReadFile(filepath.Join(dir, "cmd/arkom-runtime/data.go"))
	if _, err := parser.ParseFile(token.NewFileSet(), "data.go", legacy, parser.AllErrors); err != nil {
		t.Fatal("legacy adapter is invalid Go", err)
	}
	if strings.Contains(string(legacy), "platform.WithDataStore") {
		t.Fatal("legacy SDK was upgraded implicitly")
	}
	files[DataContractPath] = DataContracts + "\n//changed"
	if err := writeRuntimeAdapter(dir, files); err == nil {
		t.Fatal("modified data contract accepted")
	}
}
func TestStepUpgradePersistsHostDataContractBeforeValidation(t *testing.T) {
	initial := Seed()
	delete(initial, DataContractPath)
	initial["DESIGN.md"] = "Plan"
	initial["application.json"] = testManifest
	recorded := false
	engine := Engine{Provider: fakeProvider{func(Request) Turn { return Turn{Verdict: "ready"} }}, Tester: &fakeTester{}, Emit: func(e Event) error {
		if e.Path == DataContractPath && e.Kind == "file.written" {
			recorded = e.Agent == "system" && e.Before == "" && e.After == DataContracts
		}
		return nil
	}}
	files, err := engine.RunStep(context.Background(), "continue", initial, "architect")
	if err != nil || !recorded || files[DataContractPath] != DataContracts {
		t.Fatal("validated files differ from stored trace", err, recorded)
	}
}
