package construction

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRuntimeRecordsWireAndContractUpgrade(t *testing.T) {
	in := RuntimeRequest{Records: &RecordsSnapshot{NextID: "host-only"}}
	public, _ := json.Marshal(in)
	wire, _ := json.Marshal(runtimeWireRequest(in))
	if strings.Contains(string(public), "host-only") || !strings.Contains(string(wire), "host-only") {
		t.Fatal("record snapshot is not restricted to the internal wire")
	}
	for _, invalid := range []string{"", "{", `"` + strings.Repeat("x", MaxRecordBytes) + `"`, `"` + strings.Repeat("<", MaxRecordBytes/6+1) + `"`} {
		if ValidRecord(json.RawMessage(invalid)) {
			t.Fatal("record exceeds canonical JSON bound", invalid)
		}
	}
	if !ValidRecord(json.RawMessage(`null`)) || !ValidRecord(json.RawMessage(`{"note":"á"}`)) {
		t.Fatal("valid JSON rejected")
	}
	files := Seed()
	delete(files, RecordsContractPath)
	dir := t.TempDir()
	if err := writeRuntimeAdapter(dir, files); err != nil {
		t.Fatal(err)
	}
	legacy, _ := os.ReadFile(filepath.Join(dir, "cmd/arkom-runtime/records.go"))
	if strings.Contains(string(legacy), "platform.WithRecordStore") {
		t.Fatal("old revision was upgraded silently")
	}
	files["DESIGN.md"], files["application.json"] = "Plan", testManifest
	recorded := false
	e := Engine{Provider: fakeProvider{func(Request) Turn { return Turn{Verdict: "ready"} }}, Tester: &fakeTester{}, Emit: func(event Event) error {
		if event.Path == RecordsContractPath && event.Kind == "file.written" {
			recorded = event.Agent == "system" && event.Before == "" && event.After == RecordsContracts
		}
		return nil
	}}
	upgraded, err := e.RunStep(context.Background(), "continue", files, "architect")
	if err != nil || !recorded || !RecordsCompatible(upgraded) {
		t.Fatal("SDK upgrade missing from actual traces", err, recorded)
	}
	files[RecordsContractPath] = RecordsContracts + "\n//modified"
	if err := writeRuntimeAdapter(dir, files); err == nil {
		t.Fatal("modified record SDK accepted")
	}
}

// Compile and exercise the trusted adapter/SDK as ordinary unit-test code.
// Generated application code still executes only through the isolated runner.
func TestRuntimeRecordsAdapterLifecycle(t *testing.T) {
	dir := t.TempDir()
	files := Seed()
	files["backend/handler.go"] = `package solution
import ("arkom.local/solution/platform"; "net/http")
func NewHandler(platform.Tenant) http.Handler { return http.NewServeMux() }
`
	for name, content := range files {
		target := filepath.Join(dir, strings.TrimPrefix(name, "backend/"))
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := writeRuntimeAdapter(dir, files); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "cmd/arkom-runtime/records_test.go"), []byte(recordsAdapterTests), 0644); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "test", "-race", "./cmd/arkom-runtime")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GOWORK=off", "GOPROXY=off", "GOSUMDB=off")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("adapter unit tests: %v\n%s", err, out)
	}
}

const recordsAdapterTests = `package main
import (
 "arkom.local/solution/platform"
 "context"
 "encoding/json"
 "errors"
 "net/http"
 "strings"
 "testing"
 "time"
)
func TestRequestLocalRecords(t *testing.T) {
 ctx, pending := requestRecords(context.Background(), &recordsSnapshot{NextID:"host-id", NextCreatedAt:time.Now()})
 items, err := platform.ListRecords(ctx)
 if err != nil || items == nil || len(items)!=0 { t.Fatal(items,err) }
 value := json.RawMessage("{\"text\":\"olá\"}")
 created, err := platform.CreateRecord(ctx,value)
 if err != nil || created.ID!="host-id" || created.CreatedAt.IsZero() { t.Fatal(created,err) }
 value[0] = 'x'
 created.Value[0] = 'x'
 items,err=platform.ListRecords(ctx)
 if err!=nil || len(items)!=1 || !json.Valid(items[0].Value) { t.Fatal(items,err) }
 items[0].Value[0]='x'
 if !json.Valid(pending().Value) { t.Fatal("caller mutated staged record") }
 if _,err=platform.CreateRecord(ctx,json.RawMessage("null")); !errors.Is(err,platform.ErrRecordAlreadyCreated) { t.Fatal(err) }
 cancelled,cancel:=context.WithCancel(ctx); cancel()
 if _,err=platform.ListRecords(cancelled); !errors.Is(err,context.Canceled) { t.Fatal(err) }
 if _,err=platform.CreateRecord(cancelled,json.RawMessage("null")); !errors.Is(err,context.Canceled) { t.Fatal(err) }
 if _,err=platform.ListRecords(context.Background()); !errors.Is(err,platform.ErrRecordsUnavailable) { t.Fatal(err) }
 if _,err=platform.CreateRecord(context.Background(),json.RawMessage("null")); !errors.Is(err,platform.ErrRecordsUnavailable) { t.Fatal(err) }
 full,_:=requestRecords(context.Background(),&recordsSnapshot{Items:make([]record,platform.MaxRecords)})
 if _,err=platform.CreateRecord(full,json.RawMessage("null")); !errors.Is(err,platform.ErrRecordsLimit) { t.Fatal(err) }
 if _,err=platform.CreateRecord(ctx,json.RawMessage("{")); !errors.Is(err,platform.ErrInvalidRecord) { t.Fatal(err) }
 oversize,_:=json.Marshal(strings.Repeat("x",platform.MaxRecordBytes))
 if _,err=platform.CreateRecord(ctx,oversize); !errors.Is(err,platform.ErrInvalidRecord) { t.Fatal(err) }
}
func TestInvokeCommitsOnlySuccessfulHandlers(t *testing.T) {
 for _,status:= range []int{201,400,500,999} {
  h:=http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
   if _,err:=platform.CreateRecord(r.Context(),json.RawMessage("null"));err!=nil {t.Fatal(err)}
   if status==999 {panic("fail after staging")}
   w.WriteHeader(status)
  })
  out:=invoke(h, request{Method:"POST",Path:"/api/notes",Records:&recordsSnapshot{NextID:"id",NextCreatedAt:time.Now()}})
  if (out.RecordCreate!=nil)!=(status==201) {t.Fatal(status,out)}
 }
}
`
