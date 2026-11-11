"""Update only the isolated CLIPS services, backing up and preserving the database."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--prepare-only", action="store_true", help="Build the release archive without contacting or updating the server.")
args = parser.parse_args()

root = Path(__file__).resolve().parents[3]
identity = str(Path("~/.ssh/arkom_dev").expanduser())
destination = "dev@24.199.100.186"
ssh = ["ssh", "-i", identity, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=2", destination]
evidence = root / ".local/clips-deployment"
previous = json.loads((evidence / "release.json").read_text())["release"]
assert re.fullmatch(r"r-[0-9a-f]{12}", previous)
binary = root / ".local/clips-go-hosted"
frontend = root / ".local/arkom-clips-go-interface/dist"
if not (frontend / "index.html").is_file():
    raise SystemExit("Build the official clips-go frontend before updating.")
digest = hashlib.sha256(binary.read_bytes())
for asset in sorted(frontend.rglob("*")):
    if asset.is_file():
        if asset.is_symlink() or b"http://127.0.0.1:18089" in asset.read_bytes():
            raise SystemExit("A test frontend cannot be published.")
        digest.update(str(asset.relative_to(frontend)).encode()); digest.update(asset.read_bytes())
release = "r-" + digest.hexdigest()[:12]
if release == previous:
    raise SystemExit("This application release is already installed.")
client_file = root / ".local/arkom-clips-login-homolog/src/integrations/supabase/client.ts"
public_key = re.search(r"'(?P<key>sb_publishable_[A-Za-z0-9_-]+)'", client_file.read_text())["key"]
with tempfile.TemporaryDirectory() as temp:
    source = Path(temp)
    shutil.copy2(binary, source / "clips-go")
    shutil.copytree(frontend, source / "frontend")
    for path in Path(__file__).parent.iterdir():
        if path.is_file():
            shutil.copy2(path, source / path.name)
    (source / ".env").write_text("CLIPS_RELEASE=" + release + "\n")
    (source / "source-publishable-key").write_text(public_key)
    (source / "Dockerfile.update").write_text(
        "FROM clips-go-homolog:" + previous + "\nUSER root\nCOPY clips-go /usr/local/bin/clips-go\n"
        "COPY frontend /srv/clips-ui\nRUN chmod 0555 /usr/local/bin/clips-go\nUSER 10001:10001\n")
    archive = evidence / (release + ".tar.gz")
    subprocess.run(["tar", "-czf", str(archive), "-C", temp, "."], check=True, env={**__import__('os').environ,"COPYFILE_DISABLE":"1"})

(evidence / "prepared-release.json").write_text(json.dumps({
    "release": release, "base_release": previous, "archive": archive.name,
    "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "status": "prepared_locally",
}, indent=2) + "\n")
if args.prepare_only:
    print("Release archive prepared locally; server unchanged:", archive)
    raise SystemExit(0)

stage = subprocess.check_output(ssh + ["mktemp -d /tmp/clips-update.XXXXXXXX"], text=True).strip()
assert stage.startswith("/tmp/clips-update.")
subprocess.run(["scp", "-i", identity, "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=8", str(archive), destination+":"+stage+"/release.tar.gz"], check=True)

remote = r"""
import json,os,pathlib,subprocess,sys,time
stage=pathlib.Path(sys.argv[1]); previous=sys.argv[2]; release=sys.argv[3]
root=pathlib.Path('/opt/clips-go-homolog'); current=root/'current'
old=current.resolve(); target=root/'releases'/release
if old != root/'releases'/previous:
    raise SystemExit('The installed release changed; no services were updated.')
def compose(path,*args,**kw):
    return subprocess.run(['docker','compose',*args],cwd=path,check=True,**kw)
def containers():
    rows=subprocess.check_output(['docker','ps','--format','{{.Names}} {{.ID}}'],text=True)
    return dict(row.split() for row in rows.splitlines())
before=containers()
pending=subprocess.check_output(['docker','compose','exec','-T','postgres','psql','-U','clips_go','-d','clips_go_homolog',
    '-Atc',"SELECT count(*) FROM jobs WHERE status IN ('queued','running')"],cwd=old,text=True).strip()
if pending != '0': raise SystemExit('CLIPS has pending work; no services were updated.')
subprocess.run([str(old/'backup.sh')],check=True)
target.mkdir(parents=True,exist_ok=False)
subprocess.run(['tar','--no-same-owner','-xzf',str(stage/'release.tar.gz'),'-C',str(target)],check=True)
sys.path.insert(0,str(target))
from directory_settings import preserve_directory_settings
preserve_directory_settings(old/'.env',target/'.env')
subprocess.run(['install','-m','0444',str(target/'source-publishable-key'),'/etc/clips-go-homolog/source-publishable-key'],check=True)
compose(target,'config','--quiet')
with (target/'build.log').open('w') as log:
    subprocess.run(['docker','build','--cpuset-cpus','0','-f','Dockerfile.update','-t','clips-go-homolog:'+release,'.'],
        cwd=target,stdout=log,stderr=log,check=True)
compose(target,'run','--rm','migrate')
try:
    compose(target,'up','-d','--no-deps','api','worker')
    if pathlib.Path('/etc/clips-go-homolog/connector-services').exists():
        compose(target,'--profile','integration','up','-d','--no-deps','connectors')
    for _ in range(40):
        healthy=subprocess.run(['curl','--fail','--silent','--max-time','2','http://127.0.0.1:18102/healthz'],
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0
        if healthy: break
        time.sleep(1)
    else: raise RuntimeError('Updated CLIPS readiness did not pass.')
    after=containers()
    preserved={name:cid for name,cid in before.items() if name not in ['clips-go-homolog-api-1','clips-go-homolog-worker-1','clips-go-homolog-connectors-1']}
    if any(after.get(name)!=cid for name,cid in preserved.items()):
        raise RuntimeError('An unrelated container changed during publication; inspect before continuing.')
    link=root/'current.next'
    link.symlink_to(target)
    os.replace(link,current)
    subprocess.run([str(target/'backup.sh')],check=True)
    subprocess.run([str(target/'monitor.sh')],check=True)
except Exception:
    compose(old,'up','-d','--no-deps','api','worker')
    if 'clips-go-homolog-connectors-1' in before:
        compose(old,'--profile','integration','up','-d','--no-deps','connectors')
    link=root/'current.rollback'
    link.symlink_to(old)
    os.replace(link,current)
    raise
print(json.dumps({'release':release,'previous':previous,'preserved_containers':len(preserved),
    'postgres_container_unchanged':after['clips-go-homolog-postgres-1']==before['clips-go-homolog-postgres-1']}))
"""
result = subprocess.check_output(ssh + ["sudo python3 - " + stage + " " + previous + " " + release], input=remote, text=True)
(evidence / "update-result.txt").write_text(result)
(evidence / "release.json").write_text(json.dumps({"release": release, "previous": previous, "host": destination}, indent=2))
print("CLIPS-only update passed; previous release retained:", previous, "→", release)
