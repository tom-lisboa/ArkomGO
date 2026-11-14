#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 ]]; then
    echo "Uso: $0 usuário@servidor caminho-da-chave-SSH" >&2
    exit 64
fi

forward=()
for port in 13007 8180 8190 8194 55321; do
    forward+=(-L "127.0.0.1:$port:127.0.0.1:$port")
done
echo "ArkomGO em http://127.0.0.1:13007/demo enquanto este túnel estiver aberto."
exec ssh -NT -i "$2" -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 "${forward[@]}" "$1"
