package construction

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Sandbox struct{}

func (Sandbox) Available() bool {
	if runtime.GOOS == "darwin" {
		_, err := os.Stat("/usr/bin/sandbox-exec")
		return err == nil
	}
	if runtime.GOOS == "linux" {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		return exec.CommandContext(ctx, "docker", "info", "--format", "{{.ServerVersion}}").Run() == nil
	}
	return false
}

type cappedBuffer struct{ bytes.Buffer }

func (b *cappedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if b.Len() < 24000 {
		left := 24000 - b.Len()
		if len(p) > left {
			p = p[:left]
		}
		b.Buffer.Write(p)
	}
	return n, nil
}
func (Sandbox) Test(ctx context.Context, files map[string]string) (string, error) {
	tests := false
	source := false
	for p := range files {
		if strings.HasPrefix(p, "backend/") && strings.HasSuffix(p, "_test.go") {
			tests = true
		}
		if strings.HasPrefix(p, "backend/") && !strings.HasPrefix(p, "backend/platform/") && strings.HasSuffix(p, ".go") && !strings.HasSuffix(p, "_test.go") {
			source = true
		}
	}
	if !tests || !source {
		return "São necessários código Go e testes de comportamento.", errors.New("missing_go_source_or_tests")
	}
	dir, err := os.MkdirTemp("", "arkom-construction-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	dir, err = filepath.EvalSymlinks(dir)
	if err != nil {
		return "", err
	}
	for p, data := range files {
		if !strings.HasPrefix(p, "backend/") {
			continue
		}
		if p != "backend/go.mod" && !ValidPath(p) {
			return "", errors.New("invalid_test_path")
		}
		if p == "backend/go.mod" {
			data = Seed()[p]
		}
		if p == "backend/platform/contracts.go" {
			data = Contracts
		}
		target := filepath.Join(dir, strings.TrimPrefix(p, "backend/"))
		if err = os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return "", err
		}
		if err = os.WriteFile(target, []byte(data), 0644); err != nil {
			return "", err
		}
	}
	// Compile the host adapter alongside executable applications to catch wrong signatures.
	if RuntimeCompatible(files) {
		if err = os.MkdirAll(filepath.Join(dir, "cmd/arkom-runtime"), 0755); err != nil {
			return "", err
		}
		if err = os.WriteFile(filepath.Join(dir, "cmd/arkom-runtime/main.go"), []byte(runtimeMain), 0644); err != nil {
			return "", err
		}
	}
	tempDir := filepath.Join(dir, "tmp")
	if err = os.MkdirAll(tempDir, 0755); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 100*time.Second)
	defer cancel()
	cmd, err := sandboxCommand(ctx, dir, "test", "-v", "-count=1", "-timeout=25s", "./...")
	if err != nil {
		return "", err
	}
	isolateProcess(cmd)
	cmd.Dir = dir
	var output cappedBuffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	cmd.WaitDelay = 2 * time.Second
	err = cmd.Run()
	finishProcess(cmd)
	out := strings.ReplaceAll(output.String(), dir, "/workspace")
	if err != nil {
		return out, fmt.Errorf("isolated_test_failed: %w", err)
	}
	if !strings.Contains(out, "--- PASS: Test") {
		return out, errors.New("no_passing_behavior_test")
	}
	return out, nil
}

func sandboxCommand(ctx context.Context, dir string, args ...string) (*exec.Cmd, error) {
	var err error
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		// Generated code has no host credentials, network, home or external writes.
		// Only system toolchain files and this scratch workspace remain readable.
		profile := `(version 1)(allow default)(deny network*)(deny mach-lookup)(deny signal)(allow signal (target self))
(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/private/var/folders") (subpath "/private/var/root") (subpath "/private/tmp") (subpath "/Library/Keychains"))
(allow file-read* (subpath ` + strconv.Quote(dir) + `))
(deny file-write*)(allow file-write* (subpath ` + strconv.Quote(dir) + `) (literal "/dev/null"))`
		policy := filepath.Join(dir, "policy.sb")
		if err = os.WriteFile(policy, []byte(profile), 0600); err != nil {
			return nil, err
		}
		goBin, err := exec.LookPath("go")
		if err != nil {
			return nil, err
		}
		goBin, err = filepath.EvalSymlinks(goBin)
		if err != nil {
			return nil, err
		}
		// The build must use a system-installed toolchain, not files under a user's home.
		if !strings.HasPrefix(goBin, "/usr/") && !strings.HasPrefix(goBin, "/opt/homebrew/") {
			return nil, errors.New("system_go_toolchain_required")
		}
		cmd = exec.CommandContext(ctx, "/usr/bin/sandbox-exec", append([]string{"-f", policy, "/bin/sh", "-c", `ulimit -t 120; ulimit -f 262144; exec "$@"`, "arkom-go", goBin}, args...)...)
		cmd.Env = []string{"PATH=/usr/local/go/bin:/opt/homebrew/bin:/usr/bin:/bin", "HOME=" + dir, "GOCACHE=" + filepath.Join(dir, "cache"), "GOTMPDIR=" + filepath.Join(dir, "tmp"), "TMPDIR=" + filepath.Join(dir, "tmp"), "GOPROXY=off", "GOSUMDB=off", "GOWORK=off", "GOTOOLCHAIN=local", "CGO_ENABLED=0", "GOMAXPROCS=2"}
	case "linux":
		name := "arkom-build-" + filepath.Base(dir)
		dockerArgs := []string{"run", "-i", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=128", "--memory=512m", "--cpus=2", "--user=65532:65532", "--tmpfs", "/tmp:rw,exec,size=256m", "-v", dir + ":/workspace:ro", "-w", "/workspace", "-e", "GOCACHE=/tmp/cache", "-e", "GOTMPDIR=/tmp", "-e", "HOME=/tmp", "-e", "GOPROXY=off", "-e", "GOSUMDB=off", "-e", "GOWORK=off", "-e", "GOTOOLCHAIN=local", "-e", "CGO_ENABLED=0", "-e", "GOMAXPROCS=2", "golang:1.26", "go"}
		cmd = exec.CommandContext(ctx, "docker", append(dockerArgs, args...)...)
		os.Chmod(dir, 0755)
		go func() {
			<-ctx.Done()
			cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = exec.CommandContext(cleanup, "docker", "rm", "-f", name).Run()
		}()
	default:
		return nil, errors.New("isolated_runner_unavailable")
	}

	return cmd, nil
}
