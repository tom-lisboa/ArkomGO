package main

import (
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Local overrides are only enabled for the explicitly isolated development
// runtime. Container defaults and production secret handling stay unchanged.
func localRuntimeValue(name, fallback string) string {
	if os.Getenv("SDR_CRM_DEV_ENABLED") == "true" {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return fallback
}

func localSecretPath(name string) string {
	return filepath.Join(localRuntimeValue("SDR_LOCAL_SECRETS_DIR", "/run/secrets"), name)
}

func localWorkerAddress() string {
	return localLoopbackAddress("SDR_LOCAL_WORKER_LISTEN", "0.0.0.0:8081")
}

func localLoopbackAddress(name, fallback string) string {
	value := localRuntimeValue(name, fallback)
	if value == fallback {
		return fallback
	}
	host, port, err := net.SplitHostPort(value)
	number, parseErr := strconv.ParseUint(port, 10, 16)
	if err != nil || host != "127.0.0.1" || parseErr != nil || number == 0 {
		return "invalid-local-listen-address"
	}
	return value
}
