#!/usr/bin/env python3
"""Start the existing Multipropriedades app against its own loopback homologation."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time

root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
state = root / ".homolog"
bridge = Path(__file__).with_name("vite-bridge.mjs").resolve()
config = state / "arkom-demo.vite.config.mts"
finance_manifest = Path(sys.argv[3]) if len(sys.argv) > 3 else None

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


def finance_overlay(work):
    if finance_manifest is None:
        return []
    deadline = time.monotonic() + 120
    while not finance_manifest.is_file() and time.monotonic() < deadline:
        time.sleep(0.4)
    if not finance_manifest.is_file() or finance_manifest.stat().st_size <= 2:
        print("Maia iniciou sem a integração FinanceAI. Confira o serviço local.", flush=True)
        return []
    subprocess.run(["node", str(bridge.with_name("prepare-finance.mjs")), str(root),
                    str(finance_manifest), str(work)], cwd=root, env=env, check=True, timeout=45)
    sources = {
        root / "backend/internal/financebridge/arkom_registry.go": bridge.with_name("finance-registry.go"),
        root / "backend/internal/httpapi/arkom_finance.go": bridge.with_name("finance-http.go"),
    }
    patches = (
        ("cmd/api/main.go",
         'financebridge.Open(startup, os.Getenv("MULTI_FINANCEAI_LOCAL_FILE"),',
         'financebridge.OpenRegistry(startup, os.Getenv("ARKOM_MAIA_FINANCE_LOCAL_FILE"),'),
        ("internal/httpapi/server.go",
         'if opts.Writes && opts.Finance != nil {',
         'if opts.Writes && opts.Finance != nil {\n\t\ts.registerArkomFinance()'),
    )
    for path, anchor, replacement in patches:
        original = root / "backend" / path
        source = original.read_text()
        if source.count(anchor) != 1:
            raise RuntimeError("API local da Maia incompatível com a integração FinanceAI.")
        patched = work / original.name
        patched.write_text(source.replace(anchor, replacement, 1))
        sources[original] = patched
    overlay = work / "overlay.json"
    overlay.write_text(json.dumps({"Replace": {str(key): str(value) for key, value in sources.items()}}))
    return ["-overlay", str(overlay)]


signal.signal(signal.SIGTERM, stop)
children = []
temp = None
try:
    require_free_ports()
    subprocess.run(["node", "scripts/homolog/run.mjs", "up"], cwd=root, env=env, check=True)
    runtime = json.loads((state / "runtime.json").read_text())
    if runtime["API_URL"] != "http://127.0.0.1:55321" or not runtime["PUBLISHABLE_KEY"].startswith("sb_publishable_"):
        sys.exit("Multipropriedades: configuração local inválida.")
    key = runtime["PUBLISHABLE_KEY"]
    temp = TemporaryDirectory(prefix="arkom-finance-", dir=state)
    work = Path(temp.name)
    try:
        overlay = finance_overlay(work)
    except subprocess.SubprocessError:
        print("Maia iniciou sem a integração FinanceAI. Confira os vínculos locais.", flush=True)
        overlay = []
    subprocess.run(["go", "build", *overlay, "-o", str(output), "./cmd/api"], cwd=root / "backend", env=env, check=True)
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
        f'export default async (env) => withArkomMultiBridge(await homolog(env), {json.dumps(bool(overlay))});\n'
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
    if overlay:
        api_env["ARKOM_MAIA_FINANCE_LOCAL_FILE"] = str(work / "bindings.json")
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
    if temp:
        temp.cleanup()
