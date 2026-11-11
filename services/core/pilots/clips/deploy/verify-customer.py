"""Check the provisioned mapping and deny unauthenticated access on hosted HTTPS."""
import base64
import json
import shlex
import subprocess
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

root = Path(__file__).resolve().parents[3]
state = root / ".local/clips-identity"
record = json.loads((state / "provisioned.json").read_text())
source = json.loads((state / "source-account.json").read_text())["rows"][0]
for value in [record["id"], record["workspace_id"], source["source_user_id"],
              source["clips_instances"][0]["org_id"], source["clips_instances"][0]["instance_id"]]:
    uuid.UUID(value)
ssh = ["ssh", "-i", str(Path("~/.ssh/arkom_dev").expanduser()), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "dev@24.199.100.186"]
query = """SELECT json_build_object(
'accounts',(SELECT count(*) FROM customer_accounts),
'sessions',(SELECT count(*) FROM customer_sessions),
'mapping',EXISTS(SELECT 1 FROM customer_accounts a JOIN customer_workspaces w ON w.account_id=a.id
WHERE a.id='%s' AND w.id='%s' AND a.enabled AND a.source_project='auytmefqnuzbktyzcled'
AND a.source_user_id='%s' AND w.source_org_id='%s' AND w.source_instance_id='%s'))""" % (
    record["id"], record["workspace_id"], source["source_user_id"],
    source["clips_instances"][0]["org_id"], source["clips_instances"][0]["instance_id"])
command = "cd /opt/clips-go-homolog/current && docker compose exec -T postgres psql -U clips_go -d clips_go_homolog -Atc " + shlex.quote(query)
result = subprocess.check_output(ssh + ["sudo sh -c " + shlex.quote(command)], text=True)
mapping = json.loads(result)
assert mapping["mapping"] is True and mapping["accounts"] >= 1, mapping

base = "https://clipsgo-homolog.24-199-100-186.sslip.io"
client = build_opener(ProxyHandler({}))
def request(path, data=None, headers=None):
    try:
        with client.open(Request(base+path, data=data, headers=headers or {}), timeout=15) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()

assert request("/healthz")[0] == 200
assert request("/auth/me")[0] == 401
assert request("/auth/me", headers={"Cookie": "__Host-clips_go_auth=" + "A"*43})[0] == 401
assert request("/studio/jobs/unknown/video", headers={"Cookie": "clips_go=" + "A"*26})[0] == 401
assert request("/ops/status")[0] == 401
assert request("/auth/session", b"{}", {"Content-Type": "application/json", "Origin": "https://untrusted.invalid"})[0] == 403
def b64(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
fake = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({
    "iss": "https://auytmefqnuzbktyzcled.supabase.co/auth/v1", "sub": source["source_user_id"],
    "aud": "authenticated", "email": source["email"], "exp": int(time.time())+600,
}) + "." + base64.urlsafe_b64encode(bytes(32)).decode().rstrip("=")
status, body = request("/auth/session", b"{}", {"Content-Type": "application/json", "Authorization": "Bearer " + fake})
assert status == 401 and json.loads(body)["error"] == "invalid_source_session", (status, body)
assert request("/auth/session", b"{}", {"Content-Type": "application/json"})[0] == 429
evidence = {"account_exists": True, "exact_source_mapping": True, "anonymous_denied": True,
            "forged_session_denied": True, "source_forged_jwt_denied": True,
            "cross_origin_denied": True, "exchange_rate_limited": True,
            "customer_session_created_by_operator": False,
            "customer_interactive_login_tested": False}
(state / "verified.json").write_text(json.dumps(evidence, indent=2))
print("Hosted mapping, exact identity, HTTPS, forged-token rejection and private access passed.")
