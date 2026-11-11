"""Build the official frontend specifically for the isolated CLIPS Go host."""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
checkout = root / ".local/arkom-clips-go-interface"
base = "f44b29e60c355e397c95d4360083a10b9f7ec113"
actual = subprocess.check_output(["git","-C",str(checkout),"rev-parse","HEAD"],text=True).strip()
if actual != base:
    raise SystemExit("The official frontend source differs from the reviewed base commit.")
source = subprocess.check_output(["git","-C",str(checkout),"show",base+":src/integrations/supabase/client.ts"],text=True)
key = re.search(r"'(sb_publishable_[A-Za-z0-9_-]+)'",source)[1]
env = {k:v for k,v in os.environ.items() if not k.startswith("VITE_CLIPS_GO_") and k!="CLIPS_ALLOW_LOOPBACK_AUTH"}
env.update(VITE_CLIPS_GO_AUTH_URL="https://auytmefqnuzbktyzcled.supabase.co",VITE_CLIPS_GO_AUTH_KEY=key)
subprocess.run(["npm","run","build","--","--mode","clips-go"],cwd=checkout,env=env,check=True)
digest=hashlib.sha256()
for path in sorted((checkout/"dist").rglob("*")):
    if path.is_file():
        body=path.read_bytes()
        if b"http://127.0.0.1:18089" in body:raise SystemExit("Test Auth URL in final frontend")
        digest.update(str(path.relative_to(checkout/"dist")).encode());digest.update(body)
evidence=root/".local/clips-deployment"
(evidence/"frontend.json").write_text(json.dumps({"repository":"Bilhon-OS/arkom-clips","base_commit":base,
    "build_mode":"clips-go","source_auth_project":"auytmefqnuzbktyzcled","frontend_sha256":digest.hexdigest()},indent=2))
print("Official frontend built for same-origin Go data and central Auth only.")
