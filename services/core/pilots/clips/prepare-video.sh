#!/usr/bin/env bash
set -euo pipefail
umask 077

repo="$(cd "$(dirname "$0")/../.." && pwd)"
state="$repo/.local/clips-pilot-video"
revision=004ebac9caeb701efe993498179b9cf1c742e880
upstream="$state/upstream-$revision"
python="$state/venv/bin/python"

mkdir -p "$upstream" "$state/bin"
if [[ ! -s "$upstream/app.py" ]]; then
    curl -fsS --retry 2 \
        "https://raw.githubusercontent.com/Bilhon-OS/clips-ai-worker/$revision/app.py" -o "$upstream/app.py.tmp"
    mv "$upstream/app.py.tmp" "$upstream/app.py"
fi

if [[ ! -x "$python" ]]; then
    uv venv --python "${CLIPS_PILOT_PYTHON:-3.13}" "$state/venv"
fi
uv pip sync --python "$python" "$repo/pilots/clips/video-requirements.txt"
ffmpeg="$("$python" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
ln -sfn "$ffmpeg" "$state/bin/ffmpeg"

# Three different colors make selecting the middle interval verifiable by decoding.
"$ffmpeg" -hide_banner -loglevel error -y \
    -f lavfi -i 'color=c=red:s=320x180:r=30:d=2' \
    -f lavfi -i 'color=c=green:s=320x180:r=30:d=3' \
    -f lavfi -i 'color=c=blue:s=320x180:r=30:d=3' \
    -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=8' \
    -filter_complex '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]' \
    -map '[v]' -map 3:a -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart \
    "$state/fixture.tmp.mp4"
mv "$state/fixture.tmp.mp4" "$state/fixture.mp4"
printf '%s\n' "$revision" > "$state/prepared-revision"
