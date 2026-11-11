package main

import (
	"net"
	"os"
	"path/filepath"
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
	value := localRuntimeValue("SDR_LOCAL_WORKER_LISTEN", "0.0.0.0:8081")
	if value != "0.0.0.0:8081" {
		host, _, err := net.SplitHostPort(value)
		if err != nil || host != "127.0.0.1" {
			return "invalid-local-listen-address"
		}
	}
	return value
}
