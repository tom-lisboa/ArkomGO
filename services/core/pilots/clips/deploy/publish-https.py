"""Add only the CLIPS Go hostname to the existing Caddy configuration."""
import subprocess
from pathlib import Path

ssh = ["ssh", "-i", str(Path("~/.ssh/arkom_dev").expanduser()), "-o", "IdentitiesOnly=yes",
       "-o", "BatchMode=yes", "dev@24.199.100.186"]
fragment = Path(__file__).with_name("clips-go.caddy").read_text()
remote = r"""
import datetime, hashlib, pathlib, subprocess, sys
fragment=sys.stdin.read()
main=pathlib.Path('/etc/caddy/Caddyfile')
original=main.read_bytes()
include=pathlib.Path('/etc/caddy/clips-go.caddy')
if include.exists() or b'clips-go.caddy' in original:
    raise SystemExit('CLIPS HTTPS already exists. Review before updating.')
include.write_text(fragment)
include.chmod(0o644)
candidate=pathlib.Path('/etc/caddy/Caddyfile.clips-candidate')
candidate.write_bytes(original+b'\nimport /etc/caddy/clips-go.caddy\n')
candidate.chmod(0o644)
try:
    subprocess.run(['caddy','validate','--config',str(candidate),'--adapter','caddyfile'],check=True)
    if main.read_bytes()!=original:
        raise SystemExit('Caddy changed concurrently. Retry after reviewing.')
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup=main.with_name('Caddyfile.before-clips-'+stamp)
    backup.write_bytes(original)
    backup.chmod(0o600)
    main.write_bytes(candidate.read_bytes())
    try:
        subprocess.run(['caddy','reload','--config',str(main),'--adapter','caddyfile'],check=True)
    except BaseException:
        main.write_bytes(original)
        subprocess.run(['caddy','reload','--config',str(main),'--adapter','caddyfile'],check=True)
        raise
    print('CLIPS hostname added. Previous config stored at '+str(backup))
finally:
    candidate.unlink(missing_ok=True)
"""
# Pass the reviewed fragment as a Python literal, not as a shell argument.
script = remote.replace("fragment=sys.stdin.read()", "fragment="+repr(fragment))
subprocess.run(ssh + ["sudo python3 -"], input=script, text=True, check=True)
