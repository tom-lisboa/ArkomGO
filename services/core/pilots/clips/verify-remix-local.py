"""Build and test an official-interface Remix against a private local Go backend."""
import json
import os
import secrets
import subprocess
import tempfile
import time
from pathlib import Path

root = Path(__file__).resolve().parents[2]
checkout = root / ".local/arkom-clips-go-interface"
evidence = root / ".local/clips-remix-test"
evidence.mkdir(parents=True, exist_ok=True)
pg = Path("/opt/homebrew/opt/postgresql@17/bin")
env = {k: v for k, v in os.environ.items() if not k.startswith(("CLIPS_", "FINANCEAI_", "SDR_", "VITE_CLIPS_GO_"))}
env.update(CLIPS_REMIX_TEST_PASSWORD=secrets.token_urlsafe(24), CLIPS_INTERFACE_FFMPEG=str(root / ".local/clips-pilot-video/bin/ffmpeg"))
for mode, target in [("clips-go", "clips-remix-hub-dist"), ("clips-remix", "clips-remix-dist")]:
    with (evidence / (mode + "-build.log")).open("w") as log:
        subprocess.run(["npm", "run", "build", "--", "--mode", mode, "--outDir", str(root / ".local" / target), "--emptyOutDir"], cwd=checkout, env=env, check=True, stdout=log, stderr=subprocess.STDOUT)
with tempfile.TemporaryDirectory(prefix="clips-remix-", dir="/tmp") as temp:
    state = Path(temp)
    def pg_run(name, *args):
        return subprocess.run([str(pg / name), *args], check=True, capture_output=True)
    started = False
    server = None
    stop = state / "server.stop"
    try:
        pg_run("initdb", "-D", str(state / "pg"), "-U", "postgres", "--auth=trust", "--no-locale", "-E", "UTF8")
        pg_run("pg_ctl", "-D", str(state / "pg"), "-l", str(state / "pg.log"), "-o", f"-c listen_addresses='' -k {temp} -p 55478", "-w", "start")
        started = True
        pg_run("createdb", "-h", temp, "-p", "55478", "-U", "postgres", "clips_identity_test")
        env.update(CLIPS_IDENTITY_TEST_DSN=f"postgres://postgres@localhost:55478/clips_identity_test?sslmode=disable&host={temp}",
                   CLIPS_REMIX_E2E="1", CLIPS_REMIX_STOP=str(stop), CLIPS_REMIX_HUB_DIST=str(root / ".local/clips-remix-hub-dist"), CLIPS_REMIX_DIST=str(root / ".local/clips-remix-dist"))
        with (evidence / "server.log").open("w") as log:
            server = subprocess.Popen(["go", "test", "-count=1", "-run", "^TestRemixInterfaceServer$", "-timeout", "180s", "./pilots/clips"], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        for _ in range(200):
            if Path(str(stop) + ".ready").exists():
                break
            if server.poll() is not None:
                raise RuntimeError((evidence / "server.log").read_text()[-3000:])
            time.sleep(.1)
        else:
            raise RuntimeError("isolated Remix server did not start")
        ready = json.loads(Path(str(stop) + ".ready").read_text())
        (evidence / "installation.json").write_text(json.dumps(ready["installation"], indent=2) + "\n")
        subprocess.run(["node", "pilots/clips/verify-remix-local.mjs", str(checkout), str(stop) + ".ready"], cwd=root, env=env, check=True, timeout=120)
    finally:
        if server:
            stop.touch()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.terminate()
                server.wait(timeout=5)
        if started:
            pg_run("pg_ctl", "-D", str(state / "pg"), "-m", "immediate", "-w", "stop")
