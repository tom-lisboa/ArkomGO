"""Create the requested local account from JSON on stdin; never save its password."""
import json
import os
import subprocess
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[3]
payload=json.load(sys.stdin)
ssh=["ssh","-i",str(Path("~/.ssh/arkom_dev").expanduser()),"-o","IdentitiesOnly=yes","-o","BatchMode=yes","-o","ConnectTimeout=8","-o","ServerAliveInterval=10","-o","ServerAliveCountMax=2","dev@24.199.100.186"]
command="sudo sh -c 'cd /opt/clips-go-homolog/current && docker compose run --rm -T migrate -hosted-role provision-native'"
result=subprocess.check_output(ssh+[command],input=json.dumps(payload),text=True)
profile=json.loads(result)
assert profile['email']==payload['email'].strip().lower() and profile['auth_provider']=='local'
state=root/'.local/clips-native';state.mkdir(mode=0o700,exist_ok=True)
path=state/'provisioned.json';path.write_text(json.dumps(profile,indent=2));os.chmod(path,0o600)
print('Local account created with a private workspace and member access; password was not saved to a file.')
