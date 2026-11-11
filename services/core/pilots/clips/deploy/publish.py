"""Publish the isolated team-only CLIPS Go homologation, using the existing Arkom host."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEST = "dev@24.199.100.186"
IDENTITY = str(Path("~/.ssh/arkom_dev").expanduser())
SSH = ["ssh", "-i", IDENTITY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", DEST]
binary = ROOT / ".local/clips-go-hosted"
frontend = ROOT / ".local/arkom-clips-go-interface/dist"
digest = hashlib.sha256(binary.read_bytes())
for asset in sorted(frontend.rglob("*")):
    if asset.is_file():
        if b"http://127.0.0.1:18089" in asset.read_bytes(): raise SystemExit("A test frontend cannot be published.")
        digest.update(str(asset.relative_to(frontend)).encode()); digest.update(asset.read_bytes())
release = "r-" + digest.hexdigest()[:12]
evidence = ROOT / ".local/clips-deployment"
evidence.mkdir(mode=0o700, exist_ok=True)
stage = subprocess.check_output(SSH + ["mktemp -d /tmp/clips-release.XXXXXXXX"], text=True).strip()
assert stage.startswith("/tmp/clips-release.")
with tempfile.TemporaryDirectory() as temp:
    source = Path(temp)
    shutil.copy2(binary, source / "clips-go")
    shutil.copytree(frontend, source / "frontend")
    for path in Path(__file__).parent.iterdir():
        if path.name != "publish.py" and path.is_file():
            shutil.copy2(path, source / path.name)
    (source / ".env").write_text("CLIPS_RELEASE=" + release + "\n")
    client_file = ROOT / ".local/arkom-clips-login-homolog/src/integrations/supabase/client.ts"
    public_key = re.search(r"'(sb_publishable_[A-Za-z0-9_-]+)'", client_file.read_text())[1]
    (source / "source-publishable-key").write_text(public_key)
    tarfile = evidence / (release + ".tar.gz")
    subprocess.run(["tar", "-czf", str(tarfile), "-C", temp, "."], check=True)
    subprocess.run(["scp", "-i", IDENTITY, "-o", "IdentitiesOnly=yes", str(tarfile), DEST+":"+stage+"/release.tar.gz"], check=True)

remote = r"""
import json, os, pathlib, secrets, subprocess, sys
stage=pathlib.Path(sys.argv[1])
release=sys.argv[2]
root=pathlib.Path('/opt/clips-go-homolog')
target=root/'releases'/release
if (root/'current').exists():
    raise SystemExit('Existing CLIPS installation detected; use the reviewed update procedure.')
target.mkdir(parents=True, exist_ok=True)
subprocess.run(['tar','--no-same-owner','-xzf',str(stage/'release.tar.gz'),'-C',str(target)],check=True)
secret_dir=pathlib.Path('/etc/clips-go-homolog')
secret_dir.mkdir(mode=0o700,exist_ok=True)
for name in ['db-password','api-token']:
    path=secret_dir/name
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
    elif not path.is_file() or len(path.read_text().strip()) < 40:
        raise SystemExit('Invalid existing CLIPS secret.')
    path.chmod(0o444)  # Parent is 0700. Containers read only the explicitly mounted secret.
subprocess.run(['install','-m','0444',str(target/'source-publishable-key'),str(secret_dir/'source-publishable-key')],check=True)
os.chdir(target)
subprocess.run(['docker','compose','config','--quiet'],check=True)
with (target/'build.log').open('w') as log:
    subprocess.run(['docker','build','--cpuset-cpus','0','-t','clips-go-homolog:'+release,'.'],stdout=log,stderr=log,check=True)
subprocess.run(['docker','compose','up','-d','--wait','postgres'],check=True)
subprocess.run(['docker','compose','run','--rm','migrate'],check=True)
subprocess.run(['docker','compose','up','-d','api','worker'],check=True)
(root/'current').symlink_to(target)
for name in ['backup.sh','monitor.sh']:
    (target/name).chmod(0o755)
subprocess.run([str(target/'backup.sh')],check=True)
for name in ['clips-go-backup.service','clips-go-backup.timer','clips-go-monitor.service','clips-go-monitor.timer']:
    subprocess.run(['install','-m','0644',str(target/name),'/etc/systemd/system/'+name],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','clips-go-backup.timer','clips-go-monitor.timer'],check=True)
print(json.dumps({'release':release,'path':str(target),'private_api':'127.0.0.1:18102'}))
"""
subprocess.run(SSH + ["sudo python3 - "+stage+" "+release], input=remote, text=True, check=True)
(evidence / "release.json").write_text(json.dumps({"release":release,"host":DEST},indent=2))
print("Release deployed:", release)
