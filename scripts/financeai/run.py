#!/usr/bin/env python3
"""Run the existing FinanceAI product in a dedicated ArkomGO lab."""
from contextlib import ExitStack
import base64
import hashlib
import json
import os
from pathlib import Path
import re
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


def owner_session(secret, company, org, install):
    verifier, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    entry = call("/internal/onboarding/handoffs", {
        "organizationId": org, "installationId": install, "userReference": f"user_{company}_admin",
        "challenge": challenge, "challengeMethod": "S256", "state": nonce,
    }, authorized=secret)
    return call("/v1/auth/exchange", {
        "code": entry["code"], "installationId": install, "verifier": verifier, "state": nonce,
    }, origin=ORIGINS[company])["accessToken"]


def provision(secret):
    accounts = {}
    for company, origin in ORIGINS.items():
        name = company.title() + " · FinanceAI"
        organization = call("/internal/onboarding/organizations", {
            "customerReference": f"arkomgo-lab-{company}", "ownerReference": f"user_{company}_admin", "name": name,
            "subjects": [{"name": f"{company.title()} · Empresa fictícia", "kind": "PJ"},
                         {"name": f"{company.title()} · Titular fictício", "kind": "PF"}],
        }, authorized=secret, key=f"arkomgo-finance-v1-{company}")
        org = organization["organizationId"]
        installation = call("/internal/onboarding/installations", {
            "organizationId": org, "origin": origin,
        }, authorized=secret)
        install = installation["id"]
        access = owner_session(secret, company, org, install)
        try:
            for role in ("operator", "viewer"):
                call("/v1/members", {"reference": f"user_{company}_{role}", "role": role},
                     authorized=access, origin=origin)
        finally:
            call("/v1/auth/logout", {}, authorized=access, origin=origin)
        accounts[company] = {"organizationId": org, "installationId": install, "name": name}
    private_file(bindings, json.dumps(accounts))


def wait_job(job, authorized, origin):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        status = call("/v1/jobs/" + job["id"], authorized=authorized, origin=origin)["status"]
        if status == "done":
            return
        if status == "failed":
            break
        time.sleep(0.4)
    raise RuntimeError("O worker não preparou a conta simulada da Maia.")


def prepare_maia(secret, pg_local):
    """Bind only the PJ provisioned specifically for each synthetic Arkom company."""
    accounts = json.loads(bindings.read_text())
    result = {}
    for company, origin in ORIGINS.items():
        org = accounts[company]["organizationId"]
        install = accounts[company]["installationId"]
        if not all(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) for value in (org, install)):
            raise RuntimeError("Instalação local da Maia inválida.")
        access = owner_session(secret, company, org, install)
        try:
            def finance(path, body=None, key=None):
                return call(path, body, authorized=access, origin=origin, key=key)

            me = finance("/v1/me")
            if (me["organizationId"], me["installationId"], me["bankingMode"]) != (org, install, "simulated"):
                raise RuntimeError("A Maia exige uma instalação bancária simulada própria.")
            [subject] = [s["id"] for s in finance("/v1/subjects")
                         if s["kind"] == "PJ" and s["name"] == f"{company.title()} · Empresa fictícia"]
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", subject):
                raise RuntimeError("Titular simulado da Maia inválido.")
            connections = [c for c in finance("/v1/banking/connections")
                           if c["subjectId"] == subject and c["itemId"] == subject and c["mode"] == "simulated"]
            if not connections:
                wait_job(finance("/v1/banking/items", {"subjectId": subject, "itemId": subject},
                                 key="arkom-maia-item-" + subject), access, origin)
                connections = [c for c in finance("/v1/banking/connections")
                               if c["subjectId"] == subject and c["itemId"] == subject and c["mode"] == "simulated"]
            [connection] = connections

            def bank_accounts():
                return [a["id"] for a in finance("/v1/banking/accounts")
                        if a["subjectId"] == subject and a["connectionId"] == connection["id"]
                        and a["type"] == "BANK" and a["currency"] == "BRL"]

            bank = bank_accounts()
            if not bank:
                wait_job(finance("/v1/banking/connections/" + connection["id"] + "/sync", {},
                                 key="arkom-maia-snapshot-" + connection["id"]), access, origin)
                bank = bank_accounts()
            [account] = bank
        finally:
            call("/v1/auth/logout", {}, authorized=access, origin=origin)

        bound = {"finance_org": org, "finance_subject": subject, "finance_account": account,
                 "finance_url": f"http://127.0.0.1:{API_PORT}"}
        for field, scopes in (("finance_token", ("banking.read", "finance.read")),
                              ("title_token", ("finance.write",))):
            key_path = state / f"maia-{company}-{field}.key"
            if not key_path.exists():
                private_file(key_path, "fc_lab_" + secrets.token_urlsafe(48))
            token = key_path.read_text().strip()
            digest = hashlib.sha256(token.encode()).hexdigest()
            actor = "arkom-maia-" + field
            sql_scopes = ",".join("'" + scope + "'" for scope in scopes)
            values = f"'{digest}','{org}','{actor}',array[{sql_scopes}]"
            statements = (
                f"INSERT INTO fc_tokens(hash,organization_id,actor,scopes) VALUES({values}) ON CONFLICT(hash) DO NOTHING;\n"
                f"SELECT 1 FROM fc_tokens WHERE (hash,organization_id,actor,scopes)=({values}) "
                "AND token_kind='lab' AND active AND expires_at IS NULL;\n"
            )
            query = subprocess.run([str(pg / "psql"), *pg_local, "-d", db, "-XqAt", "-v", "ON_ERROR_STOP=1"],
                                   env=env, input=statements, text=True, capture_output=True, timeout=8)
            if query.returncode or query.stdout.strip() != "1":
                raise RuntimeError("Credencial técnica FinanceAI fora do vínculo local.")
            bound[field] = token
        result[company] = bound
    if any(result["alfa"][field] == result["beta"][field]
           for field in ("finance_org", "finance_subject", "finance_account")):
        raise RuntimeError("As empresas da Maia devem ter contas independentes.")
    private_file(state / "maia.json", json.dumps(result))


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
            provision(secret)
        for name in programs[2:]:
            children.append(subprocess.Popen([str(binaries / name)], cwd=state, env=base))
        if with_maia:
            try:
                prepare_maia(secret, pg_local)
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
