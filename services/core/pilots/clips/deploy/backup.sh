#!/bin/bash
set -euo pipefail
umask 077
cd /opt/clips-go-homolog/current
backup_dir=/var/backups/clips-go-homolog
install -d -m 0700 "$backup_dir"
exec 9>"$backup_dir/.lock"
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/clips-$stamp.dump"
docker compose exec -T postgres pg_dump -U clips_go -d clips_go_homolog -Fc > "$target.partial"
docker compose exec -T postgres pg_restore --list < "$target.partial" >/dev/null
test -s "$target.partial"
mv "$target.partial" "$target"
find "$backup_dir" -maxdepth 1 -type f -name 'clips-*.dump' -mtime +7 -delete
