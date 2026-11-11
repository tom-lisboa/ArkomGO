"""Run only the pinned upstream /trim handler, over a private Unix socket."""

import json
import signal
import sys
import types
from pathlib import Path
from urllib.parse import unquote, urlsplit

from flask import abort, request
from werkzeug.serving import run_simple


upstream, socket, scratch, recipe = map(Path, sys.argv[1:])
expected = json.loads(recipe.read_bytes())


def check_asset(path):
    if not path.is_absolute() or not path.resolve().is_relative_to(recipe.parent.resolve()) or not path.is_file():
        raise ValueError("Video and subtitles must be local files alongside the recipe")


check_asset(Path(expected["url"]))
if "subtitle_url" in expected:
    subtitle = urlsplit(expected["subtitle_url"])
    if subtitle.scheme != "file" or subtitle.netloc:
        raise ValueError("Only a local subtitle file is allowed")
    check_asset(Path(unquote(subtitle.path)))
scratch.mkdir(mode=0o700)
# Redirect startup writes and skip the face tracking dependency of disabled routes.
# The upstream trim handler itself is unchanged.
app_file = upstream / "app.py"
source = app_file.read_text()
for original, replacement in {
    "DOWNLOAD_DIR = '/tmp/downloads'": f"DOWNLOAD_DIR = {str(scratch / 'downloads')!r}",
    "JOBS_DB_PATH = '/tmp/jobs.db'": f"JOBS_DB_PATH = {str(scratch / 'jobs.db')!r}",
    "from rastreio import YUNET_MODELO, FalhaDeMedida, medir_trecho": "",
}.items():
    if source.count(original) != 1:
        raise RuntimeError("Upstream path assignment changed; review the pinned worker")
    source = source.replace(original, replacement)

worker = types.ModuleType("clips_upstream")
worker.__file__ = str(app_file)
sys.modules[worker.__name__] = worker
exec(compile(source, str(app_file), "exec"), worker.__dict__)
worker.app.config["MAX_CONTENT_LENGTH"] = 1024


@worker.app.before_request
def only_local_fixture():
    if request.method != "POST" or request.path != "/trim":
        abort(404)
    if request.get_json(silent=True) != expected:
        abort(400)


def stop(_signum, _frame):
    raise KeyboardInterrupt


signal.signal(signal.SIGTERM, stop)
run_simple(f"unix://{socket}", 0, worker.app, threaded=True)
