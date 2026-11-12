package construction

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type frontendBuffer struct{ bytes.Buffer }

func (b *frontendBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 2*1024*1024 {
		return 0, errors.New("frontend_output_limit")
	}
	return b.Buffer.Write(p)
}

func (Sandbox) CompileFrontend(ctx context.Context, files map[string]string) (FrontendResult, error) {
	var result FrontendResult
	toolchain, err := filepath.EvalSymlinks(os.Getenv("ARKOM_FRONTEND_TOOLCHAIN"))
	if err != nil || !filepath.IsAbs(toolchain) {
		return result, errors.New("frontend_compiler_unavailable")
	}
	for _, name := range []string{"compiler.mjs", "node_modules/svelte/package.json", "node_modules/esbuild/package.json"} {
		if _, err := os.Stat(filepath.Join(toolchain, name)); err != nil {
			return result, errors.New("frontend_compiler_unavailable")
		}
	}
	sources := map[string]string{}
	size := 0
	for name, value := range files {
		if !strings.HasPrefix(name, "frontend/src/") {
			continue
		}
		if !frontendSource(name) || len(value) > 48000 {
			return result, errors.New("frontend_source_invalid")
		}
		sources[name] = value
		size += len(value)
	}
	if size > 350000 || len(sources) > 48 {
		return result, errors.New("frontend_source_limit")
	}
	input, _ := json.Marshal(sources)
	dir, err := os.MkdirTemp("", "arkom-frontend-")
	if err != nil {
		return result, err
	}
	defer os.RemoveAll(dir)
	dir, err = filepath.EvalSymlinks(dir)
	if err != nil {
		return result, err
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	cmd, err := frontendCommand(ctx, dir, toolchain)
	if err != nil {
		return result, err
	}
	isolateProcess(cmd)
	cmd.Stdin = bytes.NewReader(input)
	var stdout frontendBuffer
	var stderr cappedBuffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.WaitDelay = 2 * time.Second
	err = cmd.Run()
	finishProcess(cmd)
	if json.Unmarshal(stdout.Bytes(), &result) != nil {
		return result, errors.New("frontend_compilation_failed")
	}
	if err != nil || !result.OK {
		return result, errors.New("frontend_compilation_failed")
	}
	return result, nil
}

func frontendCommand(ctx context.Context, dir, toolchain string) (*exec.Cmd, error) {
	switch runtime.GOOS {
	case "darwin":
		node, err := exec.LookPath("node")
		if err != nil {
			return nil, errors.New("frontend_compiler_unavailable")
		}
		node, err = filepath.EvalSymlinks(node)
		if err != nil {
			return nil, err
		}
		if !strings.HasPrefix(node, "/usr/") && !strings.HasPrefix(node, "/opt/homebrew/") {
			return nil, errors.New("system_node_toolchain_required")
		}
		profile := `(version 1)(allow default)(deny network*)(deny mach-lookup)(deny signal)(allow signal (target self))
(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/private/var/folders") (subpath "/private/var/root") (subpath "/private/tmp") (subpath "/Library/Keychains"))
(allow file-read* (subpath ` + strconv.Quote(toolchain) + `) (subpath ` + strconv.Quote(dir) + `))
(deny file-write*)(allow file-write* (subpath ` + strconv.Quote(dir) + `) (literal "/dev/null"))`
		policy := filepath.Join(dir, "policy.sb")
		if err := os.WriteFile(policy, []byte(profile), 0600); err != nil {
			return nil, err
		}
		cmd := exec.CommandContext(ctx, "/usr/bin/sandbox-exec", "-f", policy, "/bin/sh", "-c", `ulimit -t 45; ulimit -f 8192; exec "$@"`, "arkom-svelte", node, "--max-old-space-size=256", filepath.Join(toolchain, "compiler.mjs"))
		cmd.Dir = dir
		cmd.Env = []string{"PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin", "HOME=" + dir, "TMPDIR=" + dir, "NODE_ENV=production"}
		return cmd, nil
	case "linux":
		name := "arkom-svelte-" + filepath.Base(dir)
		cmd := exec.CommandContext(ctx, "docker", "run", "-i", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=512m", "--cpus=2", "--user=65532:65532", "--tmpfs", "/tmp:rw,noexec,size=32m", "-v", toolchain+":/toolchain:ro", "-w", "/tmp", "-e", "HOME=/tmp", "-e", "NODE_ENV=production", "node:24-bookworm-slim", "node", "--max-old-space-size=256", "/toolchain/compiler.mjs")
		go func() {
			<-ctx.Done()
			cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = exec.CommandContext(cleanup, "docker", "rm", "-f", name).Run()
		}()
		return cmd, nil
	default:
		return nil, errors.New("isolated_runner_unavailable")
	}
}
