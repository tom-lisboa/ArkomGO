#!/usr/bin/python3
"""Prepare one ArkomGO organization using only the dedicated homologation services."""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from uuid import UUID

state = Path("/var/lib/arkomgo-homolog")
secret_dir = Path("/etc/arkomgo-homolog/secrets")
finance_state = state / "finance"
maia_state = state / "maia"
finance_api = "http://127.0.0.1:8195"
maia_auth = "http://127.0.0.1:55321"
maia_api = "http://127.0.0.1:8190"

# All targets are loopback constants. Never forward credentials on redirects.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def request(base, path, payload=None, *, token=None, origin=None, key=None, api_key=None, method=None):
    headers = {}
    for name, value in (("Authorization", "Bearer " + token if token else None),
                        ("Origin", origin), ("Idempotency-Key", key), ("apikey", api_key)):
        if value:
            headers[name] = value
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with http.open(request, timeout=7) as result:
        return json.load(result) if result.status != 204 else None


def derived(secret, company, purpose):
    return hmac.new(secret.encode(), f"arkomgo/signup/v1/{company}/{purpose}".encode(), hashlib.sha256).hexdigest()


def write_private(path, value, *, raw=False):
    path.parent.mkdir(mode=0o700, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        temp = Path(tmp.name)
        try:
            if raw:
                tmp.write(value)
            else:
                json.dump(value, tmp, ensure_ascii=False)
            tmp.flush()
            os.fsync(tmp.fileno())
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)


def call_database(kind, function, parameters):
    port, database = {"maia": (55322, "postgres"), "finance": (55496, "financeai_lab_arkom")}[kind]
    password = (secret_dir / f"signup-{kind}-postgres").read_text().strip()
    statement = f"SELECT {function}(" + ",".join(":'" + key + "'" for key in parameters) + ");"
    # Send SQL and values on stdin so credentials and company details stay out
    # of process arguments. psql performs SQL literal escaping at interpolation.
    assignments = []
    for name, value in parameters.items():
        escaped = value.replace("\\", "\\\\").replace("'", "\\'").replace("\r", "\\r").replace("\n", "\\n")
        assignments.append(f"\\set {name} '{escaped}'")
    result = subprocess.run(
        ["/usr/bin/psql", "-XqAt", "-w", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1",
         "-U", "arkomgo_signup", "-p", str(port), "-d", database],
        input="\n".join([*assignments, statement, ""]), text=True, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, env={"PATH": "/usr/bin:/bin", "PGPASSWORD": password}, timeout=7,
    )
    if result.returncode or result.stdout.strip() != "ready":
        raise RuntimeError("database did not confirm tenant binding")


def finance_setup(data, secret):
    company, actor, name = data["company"], data["user_id"], data["name"]
    origin = f"https://finance-{company}.arkom.test"

    binding = request(finance_api, "/internal/onboarding/organizations", {
        "customerReference": data["organization_id"], "ownerReference": actor, "name": name,
        "subjects": [{"name": name, "kind": "PJ"}],
    }, token=secret, key=f"arkomgo-signup-{company}")
    organization = binding["organizationId"]
    [subject] = [s["id"] for s in binding["subjects"] if s["kind"] == "PJ"]
    installation = request(finance_api, "/internal/onboarding/installations",
                           {"organizationId": organization, "origin": origin}, token=secret)
    if installation["origin"] != origin or not installation["active"] or not installation["verified"]:
        raise RuntimeError("invalid finance installation")
    install = installation["id"]
    nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    handoff = request(finance_api, "/internal/onboarding/handoffs", {
        "organizationId": organization, "installationId": install, "userReference": actor,
        "challenge": challenge, "challengeMethod": "S256", "state": nonce,
    }, token=secret)
    if handoff["origin"] != origin or handoff["installationId"] != install or handoff["state"] != nonce:
        raise RuntimeError("invalid finance handoff")
    access = request(finance_api, "/v1/auth/exchange", {
        "code": handoff["code"], "installationId": install, "verifier": verifier, "state": nonce,
    }, origin=origin)["accessToken"]

    def account_call(path, body=None, key=None, method=None):
        return request(finance_api, "/v1" + path, body, token=access, origin=origin, key=key, method=method)

    def wait_job(job):
        deadline = time.monotonic() + 22
        while time.monotonic() < deadline:
            status = account_call("/jobs/" + job["id"])["status"]
            if status == "done":
                return
            if status == "failed":
                break
            time.sleep(0.5)
        raise RuntimeError("finance worker did not prepare the account")

    try:
        profile = account_call("/me")
        if (profile["organizationId"], profile["installationId"], profile["bankingMode"]) != (
                organization, install, "simulated"):
            raise RuntimeError("finance installation outside homologation")
        account_call("/finance/business-profile", {
            "expectedVersion": 0, "context": data["description"],
        }, key="signup-profile-" + company, method="PUT")

        def connections():
            return [row for row in account_call("/banking/connections")
                    if row["subjectId"] == subject and row["itemId"] == subject and row["mode"] == "simulated"]

        found = connections()
        if not found:
            wait_job(account_call("/banking/items", {"subjectId": subject, "itemId": subject},
                                  key="signup-item-" + company))
            found = connections()
        [connection] = found

        def accounts():
            return [row["id"] for row in account_call("/banking/accounts")
                    if row["subjectId"] == subject and row["connectionId"] == connection["id"]
                    and row["type"] == "BANK" and row["currency"] == "BRL"]

        found = accounts()
        if not found:
            wait_job(account_call("/banking/connections/" + connection["id"] + "/sync", {},
                                  key="signup-snapshot-" + company))
            found = accounts()
        [account] = found
    finally:
        account_call("/auth/logout", {})

    frontend = {"organizationId": organization, "installationId": install, "name": name}
    return frontend, {"finance_url": finance_api, "finance_org": organization,
                      "finance_subject": subject, "finance_account": account}


def maia_account(data, secret):
    runtime = json.loads((maia_state / "runtime.json").read_text())
    publishable = runtime["PUBLISHABLE_KEY"]
    admin = runtime["SERVICE_ROLE_KEY"]
    if runtime["API_URL"] != maia_auth or not publishable.startswith("sb_publishable_") or len(admin) < 32:
        raise RuntimeError("invalid Maia homologation")
    company = data["company"]
    mail = company + "@maia.arkom.test"
    password = derived(secret, company, "maia-account")
    current = None
    try:
        current = request(maia_auth, "/auth/v1/admin/users", {
            "email": mail, "password": password, "email_confirm": True,
        }, api_key=admin, token=admin)
    except urllib.error.HTTPError as error:
        if error.code not in (409, 422):
            raise
    session = request(maia_auth, "/auth/v1/token?grant_type=password", {
        "email": mail, "password": password,
    }, api_key=publishable)
    actor = str(UUID(session["user"]["id"]))
    if session["user"]["email"] != mail or current and current["id"] != actor:
        raise RuntimeError("Maia identity mismatch")
    binding = {"ID": actor, "Email": mail, "Password": password,
               "Org": str(UUID(company[2:])), "Role": "admin"}
    return binding, session["access_token"], publishable


def bridge_setup(data, secret, finance, maia):
    company = data["company"]
    finance_tokens = {}
    for purpose in ("finance_token", "title_token"):
        value = "fc_lab_" + derived(secret, company, purpose)
        call_database("finance", "arkomgo_homolog.bridge_token", {
            "tenant": finance["finance_org"], "orgref": data["organization_id"],
            "digest": hashlib.sha256(value.encode()).hexdigest(), "actor": "arkom-maia-" + purpose,
        })
        finance_tokens[purpose] = value

    login = "multi_finance_" + derived(secret, company, "bridge-role")[:16]
    password = derived(secret, company, "bridge-password")
    call_database("maia", "homolog.arkomgo_signup", {
        "tenant": maia["Org"], "actor": maia["ID"], "email": maia["Email"], "name": data["name"],
        "login": login, "password": password, "finorg": finance["finance_org"],
        "finaccount": finance["finance_account"], "finsubject": finance["finance_subject"],
    })
    finance["multi_org"] = maia["Org"]
    finance["multi_database_url"] = f"postgres://{login}:{password}@127.0.0.1:55322/postgres?sslmode=disable"
    finance["finance_token"] = finance_tokens["finance_token"]
    directory = maia_state / "finance" / "onboarded"
    write_private(directory / (maia["Org"] + ".json"), finance)
    write_private(directory / (maia["Org"] + ".title"), finance_tokens["title_token"], raw=True)


def main():
    os.umask(0o077)
    step = "configuration"
    try:
        data = json.load(sys.stdin)
        company = data["company"]
        if not re.fullmatch(r"h-[a-f0-9]{32}", company) or (
                data["organization_id"], data["user_id"]) != ("org_" + company, "user_" + company):
            raise RuntimeError("invalid portal organization")
        secret = (finance_state / "provisioning.key").read_text().strip()
        if len(secret) < 32:
            raise RuntimeError("invalid provisioner configuration")
        step = "finance"
        frontend, finance = finance_setup(data, secret)
        step = "maia"
        maia, session, public = maia_account(data, secret)
        step = "bridge"
        bridge_setup(data, secret, finance, maia)
        try:
            access = request(maia_api, "/v1/orgs/" + maia["Org"] + "/acesso", token=session)
            if access["org_id"] != maia["Org"] or access["papel"] != "admin":
                raise RuntimeError("invalid Maia permissions")
        finally:
            request(maia_auth, "/auth/v1/logout", {}, token=session, api_key=public, method="POST")
        step = "bindings"
        write_private(finance_state / "onboarded" / (company + ".json"), frontend)
        write_private(maia_state / "onboarded" / (company + ".json"), maia)
    except Exception as error:
        print(step)
        if isinstance(error, urllib.error.HTTPError):
            print(f"{step}: HTTP {error.code}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
