"""Provision the synthetic FinanceAI organizations and their Maia service bindings."""
import base64
import hashlib
import json
import os
import re
import secrets
import subprocess
import time
import urllib.error
import urllib.request

from web import API_PORT, ORIGINS


def private_file(path, value):
    temp = path.with_name(path.name + ".new")
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as handle:
        handle.write(value)
    temp.replace(path)


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


def provision(secret, bindings):
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


def prepare_maia(secret, pg_local, *, state, pg, database, env):
    bindings = state / "bindings.json"
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
            query = subprocess.run([str(pg / "psql"), *pg_local, "-d", database, "-XqAt", "-v", "ON_ERROR_STOP=1"],
                                   env=env, input=statements, text=True, capture_output=True, timeout=8)
            if query.returncode or query.stdout.strip() != "1":
                raise RuntimeError("Credencial técnica FinanceAI fora do vínculo local.")
            bound[field] = token
        result[company] = bound
    if any(result["alfa"][field] == result["beta"][field]
           for field in ("finance_org", "finance_subject", "finance_account")):
        raise RuntimeError("As empresas da Maia devem ter contas independentes.")
    private_file(state / "maia.json", json.dumps(result))
