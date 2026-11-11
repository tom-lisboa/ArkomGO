"""Enable the three isolated integration connectors for the native test organization."""
import json
import os
import shlex
import subprocess
import uuid
from pathlib import Path

root=Path(__file__).resolve().parents[3]
profile=json.loads((root/'.local/clips-native/provisioned.json').read_text())
assert profile['auth_provider']=='local'
organization=str(uuid.UUID(profile['organization_id']))
ssh=["ssh","-i",str(Path("~/.ssh/arkom_dev").expanduser()),"-o","IdentitiesOnly=yes","-o","BatchMode=yes","-o","ConnectTimeout=8","-o","ServerAliveInterval=10","-o","ServerAliveCountMax=2","dev@24.199.100.186"]
state=root/'.local/platform-interop';state.mkdir(mode=0o700,exist_ok=True)
services=[]
for solution in ['social','finance','bia-sdr','clips']:
    path=state/(solution+'.json')
    if path.exists():
        credential=json.loads(path.read_text())
        assert credential['solution']==solution and credential['organization_id']==organization
    else:
        command="sudo sh -c 'cd /opt/clips-go-homolog/current && docker compose run --rm -T migrate -hosted-role provision-service'"
        raw=subprocess.check_output(ssh+[command],input=json.dumps({'solution':solution,'organization_id':organization}),text=True)
        credential=json.loads(raw)
        assert credential['organization_id']==organization and credential['solution']==solution
        path.write_text(json.dumps(credential,indent=2));os.chmod(path,0o600)
    if solution!='clips':services.append(credential)

remote=r'''
import json,pathlib,secrets,subprocess,sys,time
services=json.load(sys.stdin)
directory=pathlib.Path('/etc/clips-go-homolog')
password_file=directory/'connector-db-password'
osdir=pathlib.Path('/opt/clips-go-homolog/current')
prefix=['docker','compose','exec','-T','postgres','psql','-X','-U','clips_go','-d','clips_go_homolog','-v','ON_ERROR_STOP=1','-At']
exists=subprocess.check_output(prefix+['-c',"SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='solution_connector')"],cwd=osdir,text=True).strip()=='t'
if exists and not password_file.exists():raise SystemExit('Existing connector role has no managed credential; no password was changed.')
if not password_file.exists():password_file.write_text(secrets.token_hex(32))
password=password_file.read_text().strip()
if not all(c in '0123456789abcdef' for c in password) or len(password)!=64:raise SystemExit('Invalid connector database credential.')
sql=''
if not exists:sql="CREATE ROLE solution_connector LOGIN PASSWORD '"+password+"';\n"
sql+="GRANT CONNECT ON DATABASE clips_go_homolog TO solution_connector; GRANT USAGE ON SCHEMA solution_inbox TO solution_connector; GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA solution_inbox TO solution_connector;"
subprocess.run(prefix,input=sql,text=True,cwd=osdir,check=True,stdout=subprocess.DEVNULL)
password_file.chmod(0o444)
key_file=directory/'connector-services';key_file.write_text(json.dumps(services));key_file.chmod(0o444)
subprocess.run(['docker','compose','--profile','integration','up','-d','--no-deps','connectors'],cwd=osdir,check=True)
for _ in range(40):
    result=subprocess.run(['docker','compose','--profile','integration','exec','-T','connectors','/usr/local/bin/clips-go','-hosted-role','connectors-health'],cwd=osdir,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if result.returncode==0:break
    time.sleep(1)
else:raise SystemExit('Connector readiness did not pass.')
subprocess.run([str(osdir/'monitor.sh')],check=True)
print('SOCIAL, Finance and BIA/SDR connector processes are ready for the authorized test organization.')
'''
command='sudo python3 -c '+shlex.quote(remote)
subprocess.run(ssh+[command],input=json.dumps(services),text=True,check=True)
print('Scoped credentials stored privately. No source application database, payment or messaging action was changed.')
