//go:build !darwin && !linux

package construction

import "os/exec"

func isolateProcess(cmd *exec.Cmd) {}

func finishProcess(cmd *exec.Cmd) {}
