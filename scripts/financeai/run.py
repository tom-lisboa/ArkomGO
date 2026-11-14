#!/usr/bin/env python3
"""Run the existing FinanceAI product in a dedicated ArkomGO lab."""
from contextlib import ExitStack
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

from web import API_PORT, ORIGINS, server

source = Path(sys.argv[1]).resolve()
state = Path(sys.argv[2]).resolve()
state.mkdir(parents=True, exist_ok=True, mode=0o700)
state.chmod(0o700)
env = {name: os.environ[name] for name in ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL") if name in os.environ}
pg = Path(sys.argv[3])
pg_port = 55494
pg_data = state / "pgdata"
db = "financeai_lab_arkom"
provision_key = state / "provisioning.key"
database_key = state / "postgres.key"
bindings = state / "bindings.json"
programs = ("api", "lab", "worker", "transactions-worker", "finance-worker",
            "classification-worker", "reports-worker", "finance-execution-worker")


def private_file(path, value):
    temp = path.with_name(path.name + ".new")
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as handle:
        handle.write(value)
    temp.replace(path)


def run(args, cwd=state, extra=None, timeout=180):
    child_env = env if extra is None else extra
    subprocess.run(args, cwd=cwd, env=child_env, check=True, timeout=timeout)


def require_port(port):
    with socket.socket() as check:
        check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        check.bind(("127.0.0.1", port))


def build_web():
    # Leave the finance checkout intact. Only public, reviewed build inputs enter staging.
    staging = state / "frontend-build"
    shutil.rmtree(staging, ignore_errors=True)
    front = staging / "frontend"
    shutil.copytree(source / "frontend/src", front / "src")
    shutil.copytree(source / "examples/lovable", staging / "examples/lovable")
    for name in ("index.html", "package.json", "tsconfig.json"):
        shutil.copyfile(source / "frontend" / name, front / name)
    (front / "node_modules").symlink_to(source / "frontend/node_modules", target_is_directory=True)
    shutil.copyfile(Path(__file__).with_name("entry.tsx"), front / "src/main.tsx")
    app = front / "src/App.tsx"
    text = app.read_text()
    before = "function Workspace({session,name,modes,onExit}:{session:FinanceAISession;name:string;modes?:Modes;onExit:()=>void})"
    if text.count(before) != 1 or text.count("new FinanceAI(API,session.getAccessToken)") != 1:
        raise RuntimeError("Interface FinanceAI incompatível com o ponto de entrada Arkom.")
    text = "\n".join("const API = location.origin + '/api';" if line.startswith("const API=import.meta.env.") else line
                     for line in text.splitlines()) + "\n"
    text = text.replace(before, "export function Workspace({session,name,modes,onExit,apiBase=API}:{session:FinanceAISession;name:string;modes?:Modes;onExit:()=>void;apiBase?:string})")
    text = text.replace("new FinanceAI(API,session.getAccessToken)", "new FinanceAI(apiBase,session.getAccessToken)")
    text = text.replace("fetch(API+'/v1/audit", "fetch(apiBase+'/v1/audit")
    text = text.replace("fetch(API+'/v1/metrics", "fetch(apiBase+'/v1/metrics")
    app.write_text(text)
    session = staging / "examples/lovable/session.ts"
    text = session.read_text()
    anchor = "  /** Safe to pass directly to new FinanceAI"
    if text.count(anchor) != 1:
        raise RuntimeError("Cliente de sessão FinanceAI incompatível.")
    session.write_text(text.replace(anchor, """
  async exchangeArkomHandoff(code: string, state: string, verifier: string): Promise<void> {
    const tokens = await this.post<SessionTokens>("/v1/auth/exchange", {
      code, state, verifier, installationId: this.installationId,
    });
    this.accept(tokens);
  }
""" + anchor))
    style = front / "src/style.css"
    style.write_text("\n".join(line for line in style.read_text().splitlines()
                               if not line.startswith("@import url(")))
    run([str(front / "node_modules/.bin/tsc"), "--noEmit"], cwd=front)
    run([str(front / "node_modules/.bin/vite"), "build"], cwd=front)
    return front / "dist"


def call(path, body=None, *, authorized=None, origin=None, key=None):
    headers = {}
    if authorized:
        headers["Authorization"] = "Bearer " + authorized
    if origin:
        headers["Origin"] = origin
    if key:
        headers["Idempotency-Key"] = key
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"http://127.0.0.1:{API_PORT}" + path,
                                     json.dumps(body).encode() if body is not None else None,
                                     headers)
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.load(response) if response.status != 204 else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"FinanceAI recusou a operação {path} ({error.code}).") from None


def provision(secret):
    accounts = {}
    for company, origin in ORIGINS.items():
        name = company.title() + " · FinanceAI"
        owner = f"user_{company}_admin"
        organization = call("/internal/onboarding/organizations", {
            "customerReference": f"arkomgo-lab-{company}", "ownerReference": owner, "name": name,
            "subjects": [{"name": f"{company.title()} · Empresa fictícia", "kind": "PJ"},
                         {"name": f"{company.title()} · Titular fictício", "kind": "PF"}],
        }, authorized=secret, key=f"arkomgo-finance-v1-{company}")
        org = organization["organizationId"]
        installation = call("/internal/onboarding/installations", {
            "organizationId": org, "origin": origin,
        }, authorized=secret)
        install = installation["id"]
        verifier, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        entry = call("/internal/onboarding/handoffs", {
            "organizationId": org, "installationId": install, "userReference": owner,
            "challenge": challenge, "challengeMethod": "S256", "state": nonce,
        }, authorized=secret)
        access = call("/v1/auth/exchange", {
            "code": entry["code"], "installationId": install, "verifier": verifier, "state": nonce,
        }, origin=origin)["accessToken"]
        try:
            for role in ("operator", "viewer"):
                call("/v1/members", {"reference": f"user_{company}_{role}", "role": role},
                     authorized=access, origin=origin)
        finally:
            call("/v1/auth/logout", {}, authorized=access, origin=origin)
        accounts[company] = {"organizationId": org, "installationId": install, "name": name}
    private_file(bindings, json.dumps(accounts))


def stop(_signal, _frame):
    raise KeyboardInterrupt


signal.signal(signal.SIGTERM, stop)
children = []
try:
    require_port(pg_port)
    require_port(API_PORT)
    out = build_web()
    # Bind before starting the database, but only accept requests when provisioned.
    with ExitStack() as resources:
        web = server(out)
        resources.callback(web.server_close)
        if not provision_key.exists():
            private_file(provision_key, secrets.token_urlsafe(48))
        secret = provision_key.read_text().strip()
        if len(secret) < 32:
            raise RuntimeError("Credencial local FinanceAI inválida.")
        binaries = state / "bin"
        binaries.mkdir(exist_ok=True)
        run(["go", "build", "-o", str(binaries) + "/", *("./cmd/" + name for name in programs)], cwd=source)
        if not database_key.exists():
            private_file(database_key, secrets.token_urlsafe(48) + "\n")
        db_password = database_key.read_text().strip()
        if not (pg_data / "PG_VERSION").is_file():
            run([str(pg / "initdb"), "-D", str(pg_data), "-U", "financeai_arkom",
                 "--auth-host=scram-sha-256", "--auth-local=trust", "--pwfile=" + str(database_key),
                 "--encoding=UTF8", "--no-locale"])
        run([str(pg / "pg_ctl"), "-D", str(pg_data), "-l", str(state / "postgres.log"),
             "-o", f"-h 127.0.0.1 -p {pg_port} -k {state}", "-w", "start"])
        resources.callback(subprocess.run, [str(pg / "pg_ctl"), "-D", str(pg_data),
                                            "-m", "fast", "-w", "stop"], env=env, timeout=10)
        pg_local = ["-h", str(state), "-p", str(pg_port), "-U", "financeai_arkom"]
        exists = subprocess.check_output([str(pg / "psql"), *pg_local, "-d", "postgres",
                                         "-Atc", f"SELECT 1 FROM pg_database WHERE datname='{db}'"], env=env)
        if exists.strip() != b"1":
            run([str(pg / "createdb"), *pg_local, db])
        conn = f"postgres://financeai_arkom:{db_password}@127.0.0.1:{pg_port}"
        base = {**env, "FINANCEAI_DATABASE_URL": conn + "/" + db + "?sslmode=disable",
                "FINANCEAI_BANKING_MODE": "simulated", "FINANCEAI_AI_MODE": "simulated",
                "FINANCEAI_FISCAL_MODE": "simulated"}
        run([str(binaries / "lab"), "-operation", "migrate"], extra=base)
        api_env = {**base, "FINANCEAI_ADDRESS": f"127.0.0.1:{API_PORT}",
                   "FINANCEAI_PROVISIONING_SECRET_FILE": str(provision_key),
                   "FINANCEAI_ALLOWED_ORIGINS": ",".join(ORIGINS.values())}

        def stop_children():
            for child in children:
                if child.poll() is None:
                    child.terminate()
            for child in children:
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()

        resources.callback(stop_children)
        children.append(subprocess.Popen([str(binaries / "api")], cwd=state, env=api_env))
        for attempt in range(30):
            try:
                if call("/health")["status"] == "ok":
                    break
            except (OSError, RuntimeError):
                time.sleep(0.3)
        else:
            raise RuntimeError("API FinanceAI não iniciou.")
        if not bindings.exists():
            provision(secret)
        for name in programs[2:]:
            children.append(subprocess.Popen([str(binaries / name)], cwd=state, env=base))
        thread = threading.Thread(target=web.serve_forever, daemon=True)
        thread.start()
        resources.callback(web.shutdown)
        print("FinanceAI local pronto em http://127.0.0.1:8194", flush=True)
        while thread.is_alive() and all(child.poll() is None for child in children):
            time.sleep(0.5)
        sys.exit("O frontend ou um processo do FinanceAI encerrou.")
except KeyboardInterrupt:
    pass
