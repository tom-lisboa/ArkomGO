"""Verify the isolated hosted API using a synthetic video and private token."""
import hashlib
import http.cookiejar
import json
import secrets
import subprocess
import time
from pathlib import Path
from urllib.request import Request, build_opener, HTTPCookieProcessor, ProxyHandler
from urllib.error import HTTPError

root = Path(__file__).resolve().parents[3]
base = "https://clipsgo-homolog.24-199-100-186.sslip.io"
ssh = ["ssh","-i",str(Path("~/.ssh/arkom_dev").expanduser()),"-o","IdentitiesOnly=yes",
       "-o","BatchMode=yes","dev@24.199.100.186"]
token = subprocess.check_output(ssh+["sudo cat /etc/clips-go-homolog/api-token"],text=True).strip()
cookies = http.cookiejar.CookieJar()
client = build_opener(ProxyHandler({}), HTTPCookieProcessor(cookies))

def request(path, data=None, headers=None, authorize=True):
    all_headers = {"Authorization":"Bearer "+token} if authorize else {}
    all_headers.update(headers or {})
    try:
        with client.open(Request(base+path, data=data, headers=all_headers), timeout=20) as res:
            return res.status, res.read(), dict(res.headers)
    except HTTPError as err:
        return err.code, err.read(), dict(err.headers)

assert request("/healthz",authorize=False)[0] == 200
assert request("/ops/status",authorize=False)[0] == 401
assert request("/studio/session",b"",{"Content-Type":"application/json"},False)[0] == 401
assert request("/studio/session",b"",{"Content-Type":"application/json"})[0] == 204
source = (root/".local/clips-pilot-video/fixture.mp4").read_bytes()
boundary = "clips"+secrets.token_hex(16)
parts = []
for name,value in [("start","2"),("duration","3")]:
    parts.append(("--"+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+value+"\r\n").encode())
parts.append(("--"+boundary+'\r\nContent-Disposition: form-data; name="video"; filename="synthetic.mp4"\r\nContent-Type: video/mp4\r\n\r\n').encode()+source+b"\r\n")
parts.append(("--"+boundary+"--\r\n").encode())
data = b"".join(parts)
headers = {"Content-Type":"multipart/form-data; boundary="+boundary,"Idempotency-Key":"hosted-smoke-"+secrets.token_hex(12)}
status,body,_ = request("/studio/jobs",data,headers)
assert status==202,(status,body)
job_id = json.loads(body)["id"]
assert request("/studio/jobs",data,headers)[1] == body
deadline = time.monotonic()+100
while time.monotonic() < deadline:
    status,body,_ = request("/studio/jobs/"+job_id)
    row = json.loads(body)
    if row["status"] in ("succeeded","failed"):
        break
    time.sleep(1)
assert row["status"]=="succeeded" and row["attempts"]==1,row
status,mp4,_ = request("/studio/jobs/"+job_id+"/video")
assert status==200 and mp4[4:8]==b"ftyp"
assert request("/studio/jobs/"+job_id+"/video",authorize=False)[0] == 401
status,chunk,_ = request("/studio/jobs/"+job_id+"/video",headers={"Range":"bytes=0-11"})
assert status==206 and chunk==mp4[:12]
evidence=root/".local/clips-deployment"
(evidence/"smoke.mp4").write_bytes(mp4)
(evidence/"smoke.json").write_text(json.dumps({
    "https":base,"job":job_id,"status":row["status"],"attempts":row["attempts"],
    "video_bytes":len(mp4),"video_sha256":hashlib.sha256(mp4).hexdigest(),
    "unauthorized":401,"duplicate_same_job":True,"ranged_download":206,
},indent=2))
print("HTTPS, private access, queue, deduplication and real MP4 passed.")
