"""Encrypted CLIPS homologation backup pulled to this Mac over SSH."""
import fcntl
import hashlib
import hmac
import json
import os
import secrets
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

os.umask(0o077)
root = Path(__file__).resolve().parents[3]
store = root / ".local/clips-deployment/offsite"
store.mkdir(parents=True, mode=0o700, exist_ok=True)
lock = (store / ".lock").open("w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
key = store / "backup-key"
if not key.exists():
    with key.open("x") as out:
        out.write(secrets.token_hex(48))
secret = key.read_bytes()
signing_key = hmac.digest(secret, b"clips-backup-authentication-v1", "sha256")
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
encrypted = store / ("clips-" + stamp + ".enc")
partial = encrypted.with_suffix(".partial")
ssh = ["ssh", "-i", str(Path("~/.ssh/arkom_dev").expanduser()),
       "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "dev@24.199.100.186"]
remote = r"""
import pathlib, subprocess, sys
subprocess.run(['/opt/clips-go-homolog/current/backup.sh'], check=True)
files=sorted(pathlib.Path('/var/backups/clips-go-homolog').glob('clips-*.dump'))
with files[-1].open('rb') as source:
    while chunk:=source.read(1024*1024):
        sys.stdout.buffer.write(chunk)
"""
fetch = subprocess.Popen(ssh + ["sudo python3 -"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
fetch.stdin.write(remote.encode())
fetch.stdin.close()
openssl = "/opt/homebrew/opt/openssl@3/bin/openssl"
try:
    with partial.open("wb") as output:
        subprocess.run([openssl, "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "200000",
                        "-pass", "file:"+str(key)], stdin=fetch.stdout, stdout=output, check=True, timeout=180)
    fetch.stdout.close()
    if fetch.wait(timeout=10) != 0:
        raise RuntimeError("Remote backup failed")
    digest = hmac.new(signing_key, digestmod=hashlib.sha256)
    with partial.open("rb") as payload:
        while block := payload.read(1024*1024):
            digest.update(block)
    partial.replace(encrypted)
    encrypted.with_suffix(".json").write_text(json.dumps({
        "format": "openssl-aes256cbc-pbkdf2-sha256-200000+hmacsha256",
        "hmac": digest.hexdigest(), "created_at": stamp,
        "encrypted_bytes": encrypted.stat().st_size,
    }, indent=2))
    # Delete only encrypted snapshots older than the documented retention.
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    for old in store.glob("clips-*.enc"):
        if datetime.fromtimestamp(old.stat().st_mtime, timezone.utc) < cutoff:
            old.unlink()
            old.with_suffix(".json").unlink(missing_ok=True)
    print("Encrypted offsite backup saved:", encrypted.name)
finally:
    partial.unlink(missing_ok=True)
    if fetch.poll() is None:
        fetch.terminate()
        fetch.wait(timeout=10)
