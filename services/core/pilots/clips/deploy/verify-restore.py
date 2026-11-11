"""Verify authentication, decrypt the offsite snapshot and restore into a temporary DB."""
import hashlib
import hmac
import json
import os
import subprocess
import tempfile
from pathlib import Path

os.umask(0o077)
root = Path(__file__).resolve().parents[3]
store = root / ".local/clips-deployment/offsite"
snapshot = sorted(store.glob("clips-*.enc"))[-1]
secret = (store / "backup-key").read_bytes()
signing_key = hmac.digest(secret, b"clips-backup-authentication-v1", "sha256")
digest = hmac.new(signing_key, digestmod=hashlib.sha256)
with snapshot.open("rb") as stream:
    while block := stream.read(1024*1024):
        digest.update(block)
metadata = json.loads(snapshot.with_suffix(".json").read_text())
if not hmac.compare_digest(digest.hexdigest(), metadata["hmac"]):
    raise SystemExit("Encrypted backup authentication failed")
smoke = json.loads((root/".local/clips-deployment/smoke.json").read_text())
ssh = ["ssh","-i",str(Path("~/.ssh/arkom_dev").expanduser()),"-o","IdentitiesOnly=yes",
       "-o","BatchMode=yes","dev@24.199.100.186"]
remote = r"""
import hashlib,json,os,pathlib,secrets,subprocess,sys,tempfile
job=sys.argv[1]
expected=sys.argv[2]
os.chdir('/opt/clips-go-homolog/current')
name='clips_restore_'+secrets.token_hex(6)
prefix=['docker','compose','exec','-T','postgres']
subprocess.run(prefix+['createdb','-U','clips_go',name],stdin=subprocess.DEVNULL,check=True)
try:
    subprocess.run(prefix+['pg_restore','--no-owner','--no-privileges','-U','clips_go','-d',name],
        stdin=sys.stdin.buffer,check=True)
    query="SELECT encode(sha256(mp4),'hex') FROM job_videos WHERE job_id='"+job+"'"
    actual=subprocess.check_output(prefix+['psql','-U','clips_go','-d',name,'-Atc',query],stdin=subprocess.DEVNULL,text=True).strip()
    if actual!=expected:
        raise RuntimeError('Restored MP4 differs from the downloaded output')
    account=sys.argv[3] if len(sys.argv)>3 else ''
    if account:
        query="SELECT count(*) FROM customer_accounts a JOIN customer_workspaces w ON w.account_id=a.id WHERE a.id='"+account+"' AND a.enabled"
        found=subprocess.check_output(prefix+['psql','-U','clips_go','-d',name,'-Atc',query],stdin=subprocess.DEVNULL,text=True).strip()
        if found!='1': raise RuntimeError('Provisioned customer mapping missing from restored backup')
    print(json.dumps({'restored':True,'job_found':True,'video_sha256_match':True,
        'customer_mapping_restored':bool(account),'temporary_database_dropped':True}))
finally:
    subprocess.run(prefix+['dropdb','-U','clips_go',name],stdin=subprocess.DEVNULL,check=True)
"""
assert smoke["job"].isalnum() and len(smoke["video_sha256"]) == 64
# The source is a fixed reviewed script with only validated identifiers interpolated.
command = "sudo python3 -c " + __import__("shlex").quote(remote) + " " + smoke["job"] + " " + smoke["video_sha256"]
provisioned = root / ".local/clips-identity/provisioned.json"
if provisioned.exists():
    account_id = json.loads(provisioned.read_text())["id"]
    __import__("uuid").UUID(account_id)
    command += " " + account_id
with tempfile.TemporaryFile() as dump:
    subprocess.run(["/opt/homebrew/opt/openssl@3/bin/openssl","enc","-d","-aes-256-cbc","-pbkdf2",
                    "-iter","200000","-pass","file:"+str(store/"backup-key"),"-in",str(snapshot)],
                   stdout=dump,check=True)
    dump.seek(0)
    result = subprocess.check_output(ssh+[command],stdin=dump,text=True,timeout=120)
evidence=json.loads(result)
(root/".local/clips-deployment/restore.json").write_text(json.dumps(evidence,indent=2))
print("Encrypted offsite backup restored and MP4 verified.")
