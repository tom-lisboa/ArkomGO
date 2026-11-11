#!/bin/bash
set -euo pipefail
umask 077
cd /opt/clips-go-homolog/current
install -d -m 0700 /var/lib/clips-go-homolog
status=ok
curl -fsS --max-time 5 http://127.0.0.1:18102/healthz >/dev/null || status=error
containers=$(docker compose ps --status running --services | sed '/^connectors$/d' | sort | paste -sd, -)
[[ "$containers" == api,postgres,worker ]] || status=error
if [[ -f /etc/clips-go-homolog/connector-services ]]; then
    docker compose --profile integration exec -T connectors /usr/local/bin/clips-go -hosted-role connectors-health >/dev/null 2>&1 || status=error
fi
pending=$(docker compose exec -T postgres psql -U clips_go -d clips_go_homolog -Atc \
    "SELECT count(*) FROM jobs WHERE (status='queued' AND created_at<now()-interval '10 minutes') OR (status='running' AND lease_until<now())") || status=error
[[ "${pending:-unknown}" == 0 ]] || status=error
backup=$(find /var/backups/clips-go-homolog -maxdepth 1 -name 'clips-*.dump' -type f -mmin -420 -print -quit)
[[ -n "$backup" ]] || status=error
available=$(df -Pm /var/lib/docker | awk 'NR==2{print $4}')
[[ "$available" -gt 2048 ]] || status=error
printf '{"status":"%s","checked_at":"%s","stale_jobs":"%s"}\n' "$status" "$(date -u +%FT%TZ)" "${pending:-unknown}" > /var/lib/clips-go-homolog/monitor.json
if [[ "$status" != ok ]]; then
    logger -p daemon.err -t clips-go-homolog "health, queue, backup or disk check failed"
    exit 1
fi
