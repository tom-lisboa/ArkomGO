#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 3 || ! "$3" =~ ^(alfa|beta)$ ]]; then
    echo "Uso: $0 usuário@servidor caminho-da-chave-SSH alfa|beta" >&2
    exit 64
fi
echo "E-mail: $3@arkom.test"
echo "Senha:"
ssh -i "$2" -o IdentitiesOnly=yes "$1" \
    "sudo -n python3 -c 'import json; print(json.load(open(\"/var/lib/arkomgo-homolog/lab-data/credentials.json\"))[\"$3.admin\"])'"
