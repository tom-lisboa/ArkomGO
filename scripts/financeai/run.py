#!/usr/bin/env python3
"""Run the existing FinanceAI product in a dedicated ArkomGO lab."""
from contextlib import ExitStack
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

from provision import call, prepare_maia, private_file, provision
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


def run(args, cwd=state, extra=None, timeout=180):
    child_env = env if extra is None else extra
    subprocess.run(args, cwd=cwd, env=child_env, check=True, timeout=timeout)


def simulated_bank_calendar():
    """Keep simulated statement dates aligned with the Maia business day."""
    original = source / "internal/banking/transactions.go"
    data = original.read_text()
    anchor = ("now := time.Now().UTC()\n"
              "\tdate := time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.UTC)\n"
              "\tcreated := date.Add(-24 * time.Hour)\n"
              '\trows := []Transaction{{ID: "fixture-credit-')
    if data.count(anchor) != 1:
        raise RuntimeError("Calendário do extrato simulado incompatível com a Maia.")
    patched = state / "maia-simulated-transactions.go"
    patched.write_text(data.replace(anchor,
        'zone, err := time.LoadLocation("America/Sao_Paulo")\n'
        '\tif err != nil { return TransactionPage{}, err }\n'
        '\tnow := time.Now().In(zone)\n'
        '\tdate := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, time.UTC)\n'
        '\tcreated := date.Add(-24 * time.Hour)\n'
        '\trows := []Transaction{{ID: "fixture-maia-credit-')
        .replace('ID: "fixture-debit-"', 'ID: "fixture-maia-debit-"'))
    overlay = state / "maia-statement-overlay.json"
    overlay.write_text(json.dumps({"Replace": {str(original): str(patched)}}))
    return ["-overlay", str(overlay)]


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
    page = "useState<Page>('overview')"
    if text.count(before) != 1 or text.count("new FinanceAI(API,session.getAccessToken)") != 1 or text.count(page) != 1:
        raise RuntimeError("Interface FinanceAI incompatível com o ponto de entrada Arkom.")
    text = "\n".join("const API = location.origin + '/api';" if line.startswith("const API=import.meta.env.") else line
                     for line in text.splitlines()) + "\n"
    text = text.replace(before, "export function Workspace({session,name,modes,onExit,apiBase=API,titleId}:{session:FinanceAISession;name:string;modes?:Modes;onExit:()=>void;apiBase?:string;titleId?:string})")
    text = text.replace(page, "useState<Page>(titleId?'reconciliation':'overview')")
    # Focus the decision on the installment selected in Maia. The FinanceAI
    # session still authorizes every request, including reconciliation reads.
    text = text.replace("function go(p:Page){setPage(p);", "function go(p:Page){setFocus(undefined);setPage(p);")
    text = text.replace("const [recs,setRecs]=useState<Reconciliation[]>([]);",
                        "const [recs,setRecs]=useState<Reconciliation[]>([]);const [focus,setFocus]=useState(titleId);"
                        "const displayedRecs=focus?recs.filter(r=>r.titleId===focus):recs;")
    text = text.replace("{recs.length?<div className=\"recs-list\">{recs.map(",
                        "{displayedRecs.length?<div className=\"recs-list\">{displayedRecs.map(")
    # When several movements match, show the same explicit confirmation
    # already supported by the FinanceAI API for an ambiguous candidate.
    text = text.replace("{r.state==='suggested'&&<button",
                        "{(r.state==='suggested'||r.state==='ambiguous')&&<button")
    text = text.replace("{shortDate(r.bankDate)} · {money(r.amount,r.currency)}",
                        "{shortDate(r.bankDate.slice(0,10))} · {money(r.amount,r.currency)}")
    text = text.replace('<p>Crie títulos, sincronize o extrato e busque sugestões.</p>',
                        '<p>{focus?\'Atualize o extrato e busque sugestões de pagamento para esta parcela.\':\'Crie títulos, sincronize o extrato e busque sugestões.\'}</p>')
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
        with_maia = "--maia" in sys.argv[4:]
        overlay = simulated_bank_calendar() if with_maia else []
        run(["go", "build", *overlay, "-o", str(binaries) + "/", *("./cmd/" + name for name in programs)], cwd=source)
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
            provision(secret, bindings)
        for name in programs[2:]:
            children.append(subprocess.Popen([str(binaries / name)], cwd=state, env=base))
        if with_maia:
            try:
                prepare_maia(secret, pg_local, state=state, pg=pg, database=db, env=env)
            except (OSError, KeyError, ValueError, RuntimeError, subprocess.SubprocessError):
                private_file(state / "maia.json", "{}")
                print("Integração com a Maia indisponível. Confira as contas PJ simuladas.", flush=True)
        thread = threading.Thread(target=web.serve_forever, daemon=True)
        thread.start()
        resources.callback(web.shutdown)
        print("FinanceAI local pronto em http://127.0.0.1:8194", flush=True)
        while thread.is_alive() and all(child.poll() is None for child in children):
            time.sleep(0.5)
        sys.exit("O frontend ou um processo do FinanceAI encerrou.")
except KeyboardInterrupt:
    pass
