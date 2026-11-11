package arkom

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Artifact struct {
	Source   string `json:"source"`
	Tests    string `json:"tests"`
	Digest   string `json:"digest"`
	Verified bool   `json:"verified"`
}

// Generate uses a fixed, dependency-free Go template. Every model-provided value
// is encoded as JSON then quoted as a Go string; it cannot become executable code.
func Generate(s Spec) (Artifact, error) {
	if err := s.Validate(); err != nil {
		return Artifact{}, err
	}
	fields, _ := json.Marshal(s.RequiredFields)
	source := `package qualification
import ("encoding/json"; "strings")
func Missing(facts map[string]string) []string {
 var required []string
 _ = json.Unmarshal([]byte(` + strconv.Quote(string(fields)) + `), &required)
 missing:=[]string{}
 for _,field:=range required {if strings.TrimSpace(facts[field])=="" {missing=append(missing,field)}}
 return missing
}
func Title() string {return ` + strconv.Quote(s.Title) + `}
`
	tests := `package qualification
import ("encoding/json";"testing")
func TestRequiredEvidence(t *testing.T){
 var required []string
 _ = json.Unmarshal([]byte(` + strconv.Quote(string(fields)) + `), &required)
 facts:=map[string]string{}
 for _,f:=range required {facts[f]="exemplo"}
 if len(Missing(facts))!=0 {t.Fatal("complete evidence rejected")}
 for _,f:=range required {
  facts[f]="  "
  missing:=Missing(facts)
  if len(missing)!=1 || missing[0]!=f {t.Fatal("missing evidence accepted",f)}
  facts[f]="exemplo"
 }
 if Title()!=` + strconv.Quote(s.Title) + ` {t.Fatal("title mismatch")}
}
`
	src, err := format.Source([]byte(source))
	if err != nil {
		return Artifact{}, err
	}
	tst, err := format.Source([]byte(tests))
	if err != nil {
		return Artifact{}, err
	}
	sum := sha256.Sum256(append(append([]byte{}, src...), tst...))
	return Artifact{Source: string(src), Tests: string(tst), Digest: hex.EncodeToString(sum[:])}, nil
}

// Build never executes code produced freely by the model. Only the generated
// standard-library template is compiled in a temporary directory, without keys.
func Build(ctx context.Context, s Spec) (Artifact, error) {
	a, err := Generate(s)
	if err != nil {
		return a, err
	}
	dir, err := os.MkdirTemp("", "arkom-build-")
	if err != nil {
		return a, err
	}
	defer os.RemoveAll(dir)
	for name, data := range map[string]string{"go.mod": "module arkom.generated/qualification\n\ngo 1.24.0\n", "qualification.go": a.Source, "qualification_test.go": a.Tests} {
		if err = os.WriteFile(filepath.Join(dir, name), []byte(data), 0600); err != nil {
			return a, err
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "test", "-count=1", "./...")
	cmd.Dir = dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME"), "GOWORK=off", "GOTOOLCHAIN=local", "GOPROXY=off", "GOSUMDB=off", "CGO_ENABLED=0"}
	for _, name := range []string{"TMPDIR", "GOCACHE", "GOROOT"} {
		if v := os.Getenv(name); v != "" {
			cmd.Env = append(cmd.Env, name+"="+v)
		}
	}
	if output, err := cmd.CombinedOutput(); err != nil {
		return a, fmt.Errorf("go_validation_failed: %s", strings.TrimSpace(string(output)))
	}
	a.Verified = true
	return a, nil
}
