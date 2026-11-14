#!/usr/bin/env bash
set -euo pipefail
umask 077

config=/etc/arkomgo-homolog
state=/var/lib/arkomgo-homolog
release=/opt/arkomgo-homolog/current
secrets=$config/secrets
cd "$state"
export PATH="$release/bin:/usr/bin:/bin"
export TMPDIR="$state/tmp"
export SDR_CRM_DEV_ENABLED=true
export ARKOM_LOCAL_DEMO=true
export ARKOM_PLATFORM_REQUIRE_LOGIN=true
export ARKOM_LOCAL_API_LISTEN=127.0.0.1:13080
export ARKOM_LOCAL_WEB_LISTEN=127.0.0.1:13007
export SDR_LOCAL_WORKER_LISTEN=127.0.0.1:13081
export SDR_LOCAL_SECRETS_DIR="$secrets"
export SDR_OPENAI_MODEL=gpt-5.4-mini

case "${1:-}" in
    api)
        # Docker runs generated code as an unprivileged UID, under the private scratch parent.
        umask 022
        export OPENAI_API_KEY="$(<"$secrets/pilot-openai")"
        export ARKOM_CRM_BETA_HOMOLOG=true
        export SDR_GENESIS_DEMO=true SDR_PIPELINE_ENABLED=true SDR_CALENDAR_ENABLED=true
        export SDR_MEDIA_ENABLED=true SDR_CUSTOMER_DATA_ENABLED=true
        export TMPDIR="$state/sandboxes"
        export SDR_DEEPH_WORKSPACE="$state/deeph"
        export ARKOM_MULTI_STATE_DIR="$state/maia"
        export ARKOM_FINANCEAI_STATE_DIR="$state/finance"
        unset ARKOM_SIGNUP_PROVISIONER
        if [[ "${ARKOM_HOMOLOG_SIGNUP_ENABLED:-false}" == true &&
              -x "$release/signup/provision.py" && -r "$secrets/signup-maia-postgres" &&
              -r "$secrets/signup-finance-postgres" ]]; then
            export ARKOM_SIGNUP_PROVISIONER="$release/signup/provision.py"
        fi
        export ARKOM_FRONTEND_TOOLCHAIN="$release/genesis-frontend"
        if [[ -r "$config/crm-routes.json" ]]; then
            export SDR_CRM_ROUTES_FILE="$config/crm-routes.json"
        fi
        export ARKOM_LOCAL_WHATSAPP_BRIDGE=127.0.0.1:18283
        export SDR_WHATSAPP_ENGINE_URL=http://127.0.0.1:18283
        export SDR_WHATSAPP_ENGINE_TOKEN_FILE="$secrets/whatsapp-engine"
        export ARKOM_LOCAL_CLIPS_LISTEN=127.0.0.1:18282
        export SDR_CLIPS_BRIDGE_KEY="$(<"$secrets/clips-bridge")"
        exec bia
        ;;
    web)
        export ARKOM_FLUTTER_BUILD="$release/flutter" ARKOM_BIA_BUILD="$release/bia-web"
        exec bia -web
        ;;
    context|execution|calendar|media)
        export SDR_MEDIA_AUDIO_MODEL=gpt-transcribe SDR_MEDIA_VISION_MODEL=gpt-5.4-mini
        exec bia "-worker=$1"
        ;;
    wa-bridge|wa-gateway)
        export SDR_WHATSAPP_LOCAL_DEMO=true SDR_TRANSPORT_ENABLED=true
        export SDR_TRANSPORT_AUTH_URL=http://127.0.0.1:13081/internal/transport/authorize
        export SDR_WHATSAPP_ENGINE_TOKEN_FILE="$secrets/whatsapp-engine"
        export DATABASE_URL="postgres://arkomwa:$(<"$secrets/wa-postgres")@127.0.0.1:55496/arkom_sdr_whatsapp_demo?sslmode=disable"
        export WHATSMEOW_DATABASE_URL="$DATABASE_URL"
        export MEDIA_CACHE_DIR="$state/whatsapp-media"
        export WA_MAX_RUNTIMES=2 WA_MAX_RUNTIMES_PER_TENANT=1 WEBHOOK_WORKERS=1
        if [[ "$1" == wa-bridge ]]; then
            if [[ ! -f "$state/whatsapp-schema-ready" ]]; then
                (cd "$release/whatsapp" && sdr-whatsapp-engine -migrate)
                touch "$state/whatsapp-schema-ready"
            fi
            exec sdr-whatsapp-engine
        fi
        exec wa-gateway-service
        ;;
    clips)
        export ARKOM_LOCAL_CLIPS_LISTEN=127.0.0.1:18282
        export ARKOM_LOCAL_CLIPS_DATABASE_URL="postgres://clips_pilot:$(<"$secrets/clips-postgres")@127.0.0.1:55496/clips_pilot?sslmode=disable"
        export CLIPS_GIF_SEAL_FILE="$secrets/clips-gif-seal"
        export CLIPS_LOCAL_GIF_PLATFORM_KEY="$(<"$secrets/pilot-openai")"
        export SDR_CLIPS_BRIDGE_KEY="$(<"$secrets/clips-bridge")"
        exec clips --studio-ffmpeg /usr/bin/ffmpeg
        ;;
    crm)
        export ARKOM_CRM_DEV_LISTEN=127.0.0.1:8098
        export ARKOM_CRM_DATABASE_URL="postgres://arkom_crm:$(<"$secrets/crm-postgres")@127.0.0.1:55496/arkom_crm_homolog?sslmode=disable"
        set -a
        source "$config/crm.env"
        set +a
        exec crm
        ;;
    *) exit 64 ;;
esac
