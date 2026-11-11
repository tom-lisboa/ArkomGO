"""Submit a real local trim, verify the MP4 and save a playable copy."""

import argparse
import json
import re
import subprocess
import time
import uuid
from pathlib import Path
from urllib import request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--podcast", action="store_true", help="verify the local vertical podcast recipe")
podcast = parser.parse_args().podcast
local = Path(__file__).resolve().parents[2] / ".local"
state = local / ("clips-podcast" if podcast else "clips-pilot-video")
ffmpeg = local / "clips-pilot-video" / "bin" / "ffmpeg"
base = "http://127.0.0.1:18082"
client = request.build_opener(request.ProxyHandler({}))
key = "trim-" + uuid.uuid4().hex


def get(path, headers=None):
    return client.open(request.Request(base + path, headers=headers or {}), timeout=5)


def submit():
    req = request.Request(
        base + "/jobs",
        data=b'{"fixture":"entrevista-demo"}',
        headers={"Content-Type": "application/json", "Idempotency-Key": key},
    )
    with client.open(req, timeout=5) as response:
        return response.status, json.load(response)


def decode(path, *args):
    return subprocess.run(
        [str(ffmpeg), "-hide_banner", "-nostdin", "-i", str(path), *args, "pipe:1"],
        capture_output=True,
        check=True,
        timeout=15,
    )


def colors(path, dimensions, fps):
    video = decode(path, "-map", "0:v:0", "-vf", "scale=1:1",
                   "-fps_mode", "passthrough", "-pix_fmt", "rgb24", "-f", "rawvideo")
    metadata = video.stderr.decode(errors="replace").split("Output #0", 1)[0]
    assert re.search(rf"{dimensions}\b.*\b{fps} fps\b", metadata), metadata
    frames = video.stdout
    assert len(frames) % 3 == 0
    return list(zip(frames[::3], frames[1::3], frames[2::3]))


with get("/healthz") as response:
    assert json.load(response) == {"status": "ok", "mode": "local-video"}, "Start run-local.sh --video"

status, job = submit()
assert status == 202, job
status, duplicate = submit()
assert status == 200 and duplicate["id"] == job["id"], duplicate
job_path = "/jobs/" + job["id"]
deadline = time.monotonic() + 35
while time.monotonic() < deadline:
    with get(job_path) as response:
        job = json.load(response)
    if job["status"] in {"succeeded", "failed"}:
        break
    time.sleep(0.2)
assert job["status"] == "succeeded" and job["attempts"] == 1, job

result = job["result"]
download = job_path + "/video"
assert result["download_path"] == download and result["simulated"] is False, result
start, duration = (30, 13.6) if podcast else (2, 3)
assert (result["start_seconds"], result["duration_seconds"]) == (start, duration), result
with get(download) as response:
    assert response.headers.get_content_type() == "video/mp4"
    mp4 = response.read()
assert len(mp4) == result["bytes"] and mp4[4:8] == b"ftyp"
with get(download, {"Range": "bytes=0-11"}) as response:
    assert response.status == 206 and response.read() == mp4[:12]

output = state / ("podcast-vertical-legendado.mp4" if podcast else "clips-demo-2s-5s.mp4")
pending = state / (key + ".mp4")
try:
    pending.write_bytes(mp4)
    if podcast:
        fps = 29.97
        frames = colors(pending, "720x1280", r"29\.97")
        assert abs(len(frames) / fps - duration) <= 0.05, len(frames)
        # A frame during speech must contain the bright lettering in the caption band.
        caption = decode(pending, "-ss", "6.5", "-map", "0:v:0", "-frames:v", "1",
                         "-vf", "crop=640:140:40:860", "-pix_fmt", "gray", "-f", "rawvideo").stdout
        assert len(caption) == 640 * 140 and sum(value > 220 for value in caption) > 400
    else:
        fps = 30
        fixture = colors(state / "fixture.mp4", "320x180", fps)
        assert len(fixture) == 240, len(fixture)
        red, green, blue = fixture[0], fixture[60], fixture[150]
        assert red[0] > 180 and green[1] > 90 and blue[2] > 180, (red, green, blue)
        assert fixture == [red] * 60 + [green] * 90 + [blue] * 90
        frames = colors(pending, "320x180", fps)
        assert len(frames) == 90 and all(g > 90 and max(r, b) < 20 for r, g, b in frames), len(frames)
    pcm = decode(pending, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "s16le").stdout
    audio_duration = len(pcm) / 96000
    assert abs(audio_duration - duration) <= 0.05 and any(pcm), audio_duration
    pending.replace(output)
finally:
    pending.unlink(missing_ok=True)
print(json.dumps({"job": job["id"], "frames": len(frames), "fps": fps,
                  "duration_seconds": duration, "audio_seconds": round(audio_duration, 3),
                  "bytes": len(mp4), "output": str(output)}, indent=2))
