"""Provision the exact confirmed source account into the isolated CLIPS database.

Consumes the SELECT-only source-account.json evidence; sends no invitation and
does not read credentials, password hashes, or data from other applications.
"""
import json
import argparse
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
state = root / ".local/clips-identity"
document = json.loads((state / "source-account.json").read_text())
parser = argparse.ArgumentParser()
parser.add_argument("--email", required=True, help="Expected official email from the source SELECT")
args = parser.parse_args()
assert len(document["rows"]) == 1
account = document["rows"][0]
assert account["email"].lower() == args.email.lower()
assert account["email_confirmed"] and not account["banned"] and not account["deleted"]
assert len(account["clips_instances"]) == 1 and account["clips_instances"][0]["status"] == "active"
ssh = ["ssh", "-i", str(Path("~/.ssh/arkom_dev").expanduser()), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "dev@24.199.100.186"]
command = "sudo sh -c 'cd /opt/clips-go-homolog/current && docker compose run --rm -T migrate -hosted-role provision'"
result = subprocess.check_output(ssh + [command], input=json.dumps(account), text=True)
record = json.loads(result)
assert record["email"] == account["email"] and record["id"] and record["workspace_id"]
path = state / "provisioned.json"
path.write_text(json.dumps(record, indent=2))
os.chmod(path, 0o600)
print("Confirmed source account provisioned in the isolated CLIPS database; no password or email changed.")
