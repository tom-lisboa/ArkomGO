#!/usr/bin/env bash
set -euo pipefail
umask 077

repo="$(cd "$(dirname "$0")/../.." && pwd)"
pg_bin="${CLIPS_PILOT_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
state="$repo/.local/clips-pilot"
video_runtime="$repo/.local/clips-pilot-video"
video=false
homolog=false
studio=false
case "${1:-}" in
    '') ;;
    --video) video=true; state="$repo/.local/clips-pilot-video" ;;
    --podcast) video=true; state="$repo/.local/clips-podcast" ;;
    --homolog-export) video=true; homolog=true; state="$repo/.local/clips-homolog-export" ;;
    --homolog-ui) video=true; homolog=true; state="$repo/.local/clips-homolog-ui" ;;
    --studio) studio=true; state="$repo/.local/clips-go" ;;
    *) printf 'Uso: %s [--video|--podcast|--homolog-export|--homolog-ui|--studio]\n' "$0" >&2; exit 2 ;;
esac
data="$state/postgres"

if "$video"; then
    if [[ ! -s "$video_runtime/prepared-revision" || ! -x "$video_runtime/bin/ffmpeg" ]]; then
        printf 'Prepare o worker local com ./pilots/clips/prepare-video.sh\n' >&2
        exit 1
    fi
    revision=$(cat "$video_runtime/prepared-revision")
    [[ "$revision" =~ ^[0-9a-f]{40}$ ]]
fi

if "$studio" && [[ ! -x "$video_runtime/bin/ffmpeg" ]]; then
    printf 'Prepare o FFmpeg com ./pilots/clips/prepare-video.sh\n' >&2
    exit 1
fi

for program in initdb pg_ctl psql createdb; do
    if [[ ! -x "$pg_bin/$program" ]]; then
        printf 'PostgreSQL 17 não encontrado em %s. Defina CLIPS_PILOT_PG_BIN.\n' "$pg_bin" >&2
        exit 1
    fi
done

mkdir -p "$state"
if ! mkdir "$state/running"; then
    printf 'Já existe uma execução do piloto ou uma trava deixada por encerramento abrupto.\n' >&2
    exit 1
fi

socket_dir=""
app_pid=""
video_pid=""
started=false
cleanup() {
    if [[ -n "$app_pid" ]]; then
        kill -TERM "$app_pid" 2>/dev/null || true
        wait "$app_pid" 2>/dev/null || true
    fi
    if [[ -n "$video_pid" ]]; then
        kill -TERM "$video_pid" 2>/dev/null || true
        wait "$video_pid" 2>/dev/null || true
        rm -rf -- "$socket_dir/worker"
        rm -f -- "$socket_dir/worker.sock"
    fi
    if "$started"; then
        if ! "$pg_bin/pg_ctl" -D "$data" -m fast -w stop >/dev/null; then
            printf 'Não foi possível parar o Postgres do piloto. A trava foi mantida.\n' >&2
            return
        fi
    fi
    if [[ -n "$socket_dir" ]]; then
        rmdir "$socket_dir" 2>/dev/null || true
    fi
    rmdir "$state/running"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

socket_dir="$(mktemp -d /tmp/clips-pg.XXXXXXXX)"
cd "$repo"
go build -o "$state/clips-pilot" ./pilots/clips
if [[ ! -f "$data/PG_VERSION" ]]; then
    "$pg_bin/initdb" -D "$data" -U clips_pilot --auth=trust --no-locale --encoding=UTF8 > "$state/init.log"
fi
"$pg_bin/pg_ctl" -D "$data" -l "$state/postgres.log" \
    -o "-c listen_addresses='' -k '$socket_dir' -p 55474" -w start
started=true

# The database itself is the initialization marker, including after an interrupted start.
connection=(-h "$socket_dir" -p 55474 -U clips_pilot -w)
exists=$(env -u PGSERVICE -u PGHOSTADDR -u PGOPTIONS "$pg_bin/psql" "${connection[@]}" \
    -X -At -v ON_ERROR_STOP=1 -d postgres -c "SELECT 1 FROM pg_database WHERE datname = 'clips_pilot'")
if [[ "$exists" != 1 ]]; then
    env -u PGSERVICE -u PGHOSTADDR -u PGOPTIONS "$pg_bin/createdb" "${connection[@]}" clips_pilot
fi

app_flags=(--socket "$socket_dir")
if "$studio"; then
    app_flags+=(--studio-ffmpeg "$video_runtime/bin/ffmpeg")
fi
if "$video"; then
    video_socket="$socket_dir/worker.sock"
    recipe="$state/request.json"
    if "$homolog"; then
        recipe="$repo/.local/clips-podcast/request.json"
        app_flags+=(--homolog-export)
    fi
    if [[ "$state" == "$video_runtime" ]]; then
        "$video_runtime/venv/bin/python" -c \
            'import json,sys; json.dump(dict(url=sys.argv[1],start=2,duration=3), sys.stdout)' \
            "$state/fixture.mp4" > "$recipe"
    fi
    if [[ ! -s "$recipe" ]]; then
        printf 'Receita local ausente em %s\n' "$recipe" >&2
        exit 1
    fi
    env -i PATH="$video_runtime/bin:/usr/bin:/bin" BGUTIL_POT_BASE_URL=http://127.0.0.1:1 \
        YTDLP_COOKIES_PATH="$socket_dir/worker/unused-cookies.txt" \
        "$video_runtime/venv/bin/python" "$repo/pilots/clips/video-local.py" \
        "$video_runtime/upstream-$revision" "$video_socket" "$socket_dir/worker" "$recipe" \
        > "$state/worker.log" 2>&1 &
    video_pid=$!
    for ((i=0; i<100; i++)); do
        if [[ -S "$video_socket" ]]; then
            break
        fi
        if ! kill -0 "$video_pid" 2>/dev/null; then
            break
        fi
        sleep 0.1
    done
    if [[ ! -S "$video_socket" ]]; then
        printf 'O worker de vídeo não iniciou. Veja %s/worker.log\n' "$state" >&2
        exit 1
    fi
    app_flags+=(--video-socket "$video_socket" --video-recipe "$recipe")
fi

"$state/clips-pilot" "${app_flags[@]}" &
app_pid=$!
wait "$app_pid"
