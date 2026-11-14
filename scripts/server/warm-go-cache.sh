#!/usr/bin/env bash
set -euo pipefail
cache=/opt/arkomgo-homolog/go-std-cache
install -d -m 0755 "$cache"
docker run --rm --network none --memory 470m --cpus 1 \
    -e GOMAXPROCS=2 -e CGO_ENABLED=0 -e GOCACHE=/cache \
    -v "$cache:/cache" golang:1.26 go build -p 2 net/http encoding/json testing
chmod -R go-w,a+rX "$cache"
touch "$cache/.common-ready"
