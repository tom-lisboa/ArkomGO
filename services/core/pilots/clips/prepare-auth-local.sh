#!/usr/bin/env bash
set -euo pipefail
umask 077
repo="$(cd "$(dirname "$0")/../.." && pwd)"
state="$repo/.local/clips-auth-lab"
version=v2.197.0
archive="$state/auth-$version-darwin-arm64.tar.gz"
expected=3fb7998e7061e2c14f3f9555b1d94d447358c965395728e0d81eac82e0e5868b

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
    printf 'Este preparo usa o binário oficial para macOS Apple Silicon.\n' >&2
    exit 1
fi
mkdir -p "$state"
if [[ ! -s "$archive" ]]; then
    curl -fsSL --retry 2 --max-time 90 \
        "https://github.com/supabase/auth/releases/download/$version/auth-$version-darwin-arm64.tar.gz" \
        -o "$archive"
fi
actual=$(shasum -a 256 "$archive")
if [[ "${actual%% *}" != "$expected" ]]; then
    printf 'O checksum do Supabase Auth difere da versão validada.\n' >&2
    exit 1
fi
tar -xzf "$archive" -C "$state"
printf 'Supabase Auth %s preparado em %s\n' "$version" "$state"
