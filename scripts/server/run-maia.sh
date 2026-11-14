#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/opt/arkomgo-homolog/multi
state=/var/lib/arkomgo-homolog/maia
cd "$root"
export HOME="$state"
read_key() {
  /usr/bin/node -e 'const status=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(status.PUBLISHABLE_KEY)) process.exit(1); console.log(status.PUBLISHABLE_KEY)' "$state/public.json"
}
case "${1:-}" in
  api)
    export MULTI_HTTP_ADDRESS=127.0.0.1:8190
    export MULTI_ALLOWED_ORIGINS=http://127.0.0.1:8180
    export MULTI_SUPABASE_URL=http://127.0.0.1:55321
    export MULTI_SUPABASE_PUBLISHABLE_KEY="$(read_key)"
    export MULTI_ENABLE_WRITES=true
    export ARKOM_MAIA_FINANCE_LOCAL_FILE="$state/finance/bindings.json"
    exec "$root/bin/multi-api"
    ;;
  web)
    export MULTI_HOMOLOG_PUBLIC_KEY="$(read_key)"
    export VITE_MULTI_API_URL=http://127.0.0.1:8190
    exec /usr/bin/node --max-old-space-size=200 "$root/node_modules/vite/bin/vite.js" dev --config "$root/arkom-demo.vite.config.mts" --mode homologacao
    ;;
  captacao)
    export MULTI_CAPTACAO_LOCAL_DATABASE_URL="postgres://multi_captacao_worker:$(<"$state/captacao-password")@127.0.0.1:55322/postgres?sslmode=disable"
    exec "$root/bin/multi-captacao-worker"
    ;;
  *) exit 64 ;;
esac
