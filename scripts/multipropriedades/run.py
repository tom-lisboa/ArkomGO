#!/usr/bin/env python3
"""Start the existing Multipropriedades app against its own loopback homologation."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
state = root / ".homolog"
bridge = Path(__file__).with_name("vite-bridge.mjs").resolve()
config = state / "arkom-demo.vite.config.mts"

# Do not propagate Arkom, Clickmax, OpenAI, or production Multipropriedades credentials.
env = {name: os.environ[name] for name in (
    "HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"
) if name in os.environ}


def require_free_ports():
    for port in (8180, 8190):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                sys.exit(f"Multipropriedades: porta {port} já está em uso.")


def stop(_signum, _frame):
    raise KeyboardInterrupt


signal.signal(signal.SIGTERM, stop)
children = []
try:
    require_free_ports()
    subprocess.run(["node", "scripts/homolog/run.mjs", "up"], cwd=root, env=env, check=True)
    runtime = json.loads((state / "runtime.json").read_text())
    if runtime["API_URL"] != "http://127.0.0.1:55321" or not runtime["PUBLISHABLE_KEY"].startswith("sb_publishable_"):
        sys.exit("Multipropriedades: configuração local inválida.")
    key = runtime["PUBLISHABLE_KEY"]
    subprocess.run(["go", "build", "-o", str(output), "./cmd/api"], cwd=root / "backend", env=env, check=True)
    captacao = output.with_name("multi-captacao-worker")
    if (root / "backend/cmd/captacao-worker/main.go").is_file():
        subprocess.run(["go", "build", "-o", str(captacao), "./cmd/captacao-worker"],
                       cwd=root / "backend", env=env, check=True)
        children.append(subprocess.Popen([
            "node", str(bridge.with_name("captacao.mjs")), str(root), str(captacao),
        ], cwd=root, env=env))
    config.write_text(
        'import homolog from "../vite.homolog.config.ts";\n'
        f'import {{ withArkomMultiBridge }} from {json.dumps(str(bridge))};\n'
        'export default async (env) => withArkomMultiBridge(await homolog(env));\n'
    )
    api_env = {
        **env,
        "MULTI_HTTP_ADDRESS": "127.0.0.1:8190",
        "MULTI_ALLOWED_ORIGINS": "http://127.0.0.1:8180",
        "MULTI_SUPABASE_URL": "http://127.0.0.1:55321",
        "MULTI_SUPABASE_PUBLISHABLE_KEY": key,
        "MULTI_ENABLE_WRITES": "true",
    }
    web_env = {**env, "MULTI_HOMOLOG_PUBLIC_KEY": key, "VITE_MULTI_API_URL": "http://127.0.0.1:8190"}
    children.append(subprocess.Popen([str(output)], cwd=root, env=api_env))
    children.append(subprocess.Popen([
        "node", "node_modules/vite/bin/vite.js", "dev", "--config", str(config), "--mode", "homologacao",
    ], cwd=root, env=web_env))
    while all(child.poll() is None for child in children):
        time.sleep(0.5)
    sys.exit("Multipropriedades: um dos processos foi encerrado.")
except KeyboardInterrupt:
    pass
finally:
    for child in children:
        if child.poll() is None:
            child.terminate()
    for child in children:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
