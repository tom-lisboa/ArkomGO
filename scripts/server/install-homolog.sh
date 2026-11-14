#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 && $# == 1 ]]
bundle="$(realpath "$1")"
for artifact in bin/bia bin/deeph bin/docker bin/clips bin/crm bin/sdr-whatsapp-engine     bin/wa-gateway-service flutter/index.html bia-web/index.html     genesis-frontend/node_modules/svelte/package.json run-homolog.sh sandbox-docker     arkomgo-homolog@.service; do
    [[ -s "$bundle/$artifact" ]] || { echo "Artefato ausente: $artifact" >&2; exit 1; }
done
compgen -G "$bundle/whatsapp/migrations/*.sql" >/dev/null
config=/etc/arkomgo-homolog
state=/var/lib/arkomgo-homolog
root=/opt/arkomgo-homolog
account=arkomgo-homolog
db=arkomgo-homolog-pg

getent passwd "$account" >/dev/null || useradd --system --user-group --home-dir "$state" --shell /usr/sbin/nologin "$account"
install -d -m 0755 "$root" "$root/releases"
install -d -m 0750 -o root -g "$account" "$config" "$config/secrets"
install -d -m 0700 -o "$account" -g "$account" "$state" "$state/whatsapp-media" "$state/tmp" "$state/sandboxes" "$state/deeph"
release="$(mktemp -d "$root/releases/release.XXXXXXXX")"
cp -R "$bundle/." "$release/"
chown -R root:root "$release"
chmod -R a+rX,go-w "$release"
chmod 0755 "$release"
cp -R "$release/deeph/." "$state/deeph/"
chown -R "$account:$account" "$state/deeph"

secret() {
    local name=$1 encoding=$2
    [[ -s "$config/secrets/$name" ]] && return
    openssl rand "$encoding" 32 > "$config/secrets/$name"
    chown root:"$account" "$config/secrets/$name"
    chmod 0640 "$config/secrets/$name"
}

for name in context-worker execution-worker calendar-worker media-worker whatsapp-engine clips-bridge wa-postgres clips-postgres crm-postgres; do
    secret "$name" -hex
done
secret clips-gif-seal -base64
if [[ ! -s "$config/secrets/postgres-admin" ]]; then
    openssl rand -hex 32 > "$config/secrets/postgres-admin"
    chmod 0600 "$config/secrets/postgres-admin"
fi
if [[ ! -s "$config/secrets/pilot-openai" ]]; then
    install -m 0640 -o root -g "$account" /opt/sdr-next-pilot/worker-secrets/pilot-openai "$config/secrets/pilot-openai"
fi

if ! docker inspect "$db" >/dev/null 2>&1; then
    docker volume create "$db" >/dev/null
    docker run -d --name "$db" --restart unless-stopped --memory 256m --cpus 0.75 \
        -p 127.0.0.1:55496:5432 -v "$db:/var/lib/postgresql/data" \
        -v "$config/secrets/postgres-admin:/run/secrets/postgres:ro" \
        -e POSTGRES_USER=postgres -e POSTGRES_DB=postgres \
        -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres \
        postgres:17-bookworm -c shared_buffers=32MB -c max_connections=30 >/dev/null
else
    docker start "$db" >/dev/null
fi

# The init container starts a temporary socket-only PostgreSQL before opening TCP.
for attempt in {1..60}; do
    if docker exec "$db" pg_isready -q -h 127.0.0.1 -U postgres -d postgres; then
        break
    fi
    [[ "$attempt" != 60 ]]
    sleep 1
done

provision() {
    local role=$1 database=$2 secret_name=$3
    local password
    password="$(<"$config/secrets/$secret_name")"
    docker exec -i "$db" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
SELECT 'CREATE ROLE $role LOGIN PASSWORD ''$password''' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$role') \gexec
SELECT 'CREATE DATABASE $database OWNER $role' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database') \gexec
REVOKE CONNECT ON DATABASE $database FROM PUBLIC;
SQL
}
provision arkomwa arkom_sdr_whatsapp_demo wa-postgres
provision clips_pilot clips_pilot clips-postgres
provision arkom_crm arkom_crm_homolog crm-postgres

# Restrict root Docker access to a checked set of offline build commands.
install -D -m 0755 "$release/sandbox-docker" /usr/local/libexec/arkomgo-homolog-sandbox-docker
printf '%s\n' 'arkomgo-homolog ALL=(root) NOPASSWD: /usr/local/libexec/arkomgo-homolog-sandbox-docker' > "$config/sudoers"
chmod 0440 "$config/sudoers"
visudo -cf "$config/sudoers" >/dev/null
install -m 0440 "$config/sudoers" /etc/sudoers.d/arkomgo-homolog
install -D -m 0644 "$release/arkomgo-homolog@.service" /etc/systemd/system/arkomgo-homolog@.service
install -d /etc/systemd/system/arkomgo-homolog@api.service.d
printf '[Service]\nNoNewPrivileges=no\n' > /etc/systemd/system/arkomgo-homolog@api.service.d/sandbox.conf

ln -s "$release" "$root/.current-new"
mv -Tf "$root/.current-new" "$root/current"
systemctl daemon-reload
units=(api web context execution calendar media wa-bridge wa-gateway clips)
if [[ -s "$config/crm.env" && -s "$config/crm-routes.json" ]]; then
    units+=(crm)
fi
for name in "${units[@]}"; do
    systemctl enable "arkomgo-homolog@$name.service" >/dev/null
    systemctl restart "arkomgo-homolog@$name.service"
done
