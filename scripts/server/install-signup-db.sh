#!/usr/bin/env bash
# Provision the database roles used by the signup worker on the homologation host.
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 ]]
here=$(dirname "$(realpath "$0")")
secrets=/etc/arkomgo-homolog/secrets
for kind in maia finance; do
    file="$secrets/signup-$kind-postgres"
    if [[ "$kind" == maia ]]; then
        container=arkom-multi-homolog-db-1
        database=postgres
        [[ "$(docker exec "$container" psql -XAt -U postgres -d "$database" -c             'select name from homolog.environment where id')" == arkom-multi-homolog ]]
    else
        container=arkomgo-homolog-pg
        database=financeai_lab_arkom
    fi
    if [[ ! -s "$file" ]]; then
        openssl rand -hex 32 > "$file"
        chown root:arkomgo-homolog "$file"
        chmod 0640 "$file"
    fi
    password=$(<"$file")
    [[ "$password" =~ ^[a-f0-9]{64}$ ]]
    docker exec -i "$container" psql -Xq -v ON_ERROR_STOP=1 -U postgres -d "$database" <<SQL
SELECT 'CREATE ROLE arkomgo_signup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='arkomgo_signup') \gexec
ALTER ROLE arkomgo_signup PASSWORD '$password';
GRANT CONNECT ON DATABASE $database TO arkomgo_signup;
SQL
    docker exec -i "$container" psql -Xq -v ON_ERROR_STOP=1 -U postgres -d "$database" < "$here/signup-$kind.sql"
done
