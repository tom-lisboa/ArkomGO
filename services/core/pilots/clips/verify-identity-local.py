"""Run identity/ownership integration tests against disposable local Postgres and Auth."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[2]
pg = Path(os.environ.get("CLIPS_PILOT_PG_BIN", "/opt/homebrew/opt/postgresql@17/bin"))
auth_dir = root / ".local/clips-auth-lab"
auth_bin = auth_dir / "auth"

def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")

with tempfile.TemporaryDirectory(prefix="clips-id-", dir="/tmp") as temp:
    state = Path(temp)
    def run(name, *args, **kwargs):
        return subprocess.run([str(pg / name), *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, **kwargs)
    run("initdb", "-D", str(state / "pg"), "-U", "postgres", "--auth=trust", "--no-locale", "-E", "UTF8")
    started = False
    auth = None
    interface = None
    gateway = None
    stop_file = state / "interface.stop"
    try:
        run("pg_ctl", "-D", str(state / "pg"), "-l", str(state / "pg.log"), "-o", f"-c listen_addresses='' -k {temp} -p 55477", "-w", "start")
        started = True
        run("createdb", "-h", temp, "-p", "55477", "-U", "postgres", "clips_identity_test")
        dsn = f"postgres://postgres@localhost:55477/clips_identity_test?sslmode=disable&host={temp}"
        env = {**os.environ, "CLIPS_IDENTITY_TEST_DSN": dsn}
        if not auth_bin.exists():
            raise SystemExit("Run prepare-auth-local.sh first; the real Auth binary is required.")
        run("createdb", "-h", temp, "-p", "55477", "-U", "postgres", "clips_auth_test")
        run("psql", "-X", "-h", temp, "-p", "55477", "-U", "postgres", "-d", "clips_auth_test", "-c", "CREATE SCHEMA auth; ALTER ROLE postgres SET search_path=auth,public")
        secret = secrets.token_urlsafe(48)
        origin = "http://127.0.0.1:18087"
        auth_env = {
            "PATH": os.environ["PATH"], "PORT": "18087", "GOTRUE_API_HOST": "127.0.0.1",
            "API_EXTERNAL_URL": origin, "GOTRUE_SITE_URL": origin, "GOTRUE_DB_DRIVER": "postgres",
            "DATABASE_URL": f"postgres://postgres@localhost:55477/clips_auth_test?sslmode=disable&host={temp}",
            "DB_NAMESPACE": "auth", "GOTRUE_DB_AUTOMIGRATE": "true", "GOTRUE_DB_MIGRATIONS_PATH": str(auth_dir / "migrations"),
            "GOTRUE_JWT_SECRET": secret, "GOTRUE_JWT_ADMIN_ROLES": "service_role",
            "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated", "GOTRUE_JWT_AUD": "authenticated",
            "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true", "GOTRUE_DISABLE_SIGNUP": "true",
        }
        subprocess.run([str(auth_bin), "migrate"], env=auth_env, cwd=temp, check=True, capture_output=True, timeout=20)
        log = open(state / "auth.log", "w")
        auth = subprocess.Popen([str(auth_bin), "serve"], env=auth_env, cwd=temp, stdout=log, stderr=log)
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(60):
            try:
                with client.open(origin + "/health", timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                time.sleep(.15)
        else:
            raise RuntimeError("isolated Auth did not start")
        header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        claims = b64(json.dumps({"role": "service_role", "exp": int(time.time()) + 600}).encode())
        message = (header + "." + claims).encode()
        admin = message.decode() + "." + b64(hmac.new(secret.encode(), message, hashlib.sha256).digest())
        password = secrets.token_urlsafe(32)
        def post(path, body, authorization=""):
            headers = {"Content-Type": "application/json"}
            if authorization:
                headers["Authorization"] = "Bearer " + authorization
            with client.open(urllib.request.Request(origin + path, data=json.dumps(body).encode(), headers=headers), timeout=5) as response:
                return json.load(response)
        account = post("/admin/users", {"email": "bridge@homolog.invalid", "password": password, "email_confirm": True}, admin)
        session = post("/token?grant_type=password", {"email": "bridge@homolog.invalid", "password": password})
        env.update(CLIPS_IDENTITY_TEST_AUTH_URL=origin, CLIPS_IDENTITY_TEST_AUTH_JWT=session["access_token"])
        subprocess.run(["go", "test", "-race", "-count=1", "./pilots/clips"], cwd=root, env=env, check=True)
        print("Disposable Postgres, real Auth, account mapping, sessions and project isolation passed.")
        if len(sys.argv)>1:
            checkout=Path(sys.argv[1]).resolve()
            class Gateway(BaseHTTPRequestHandler):
                def log_message(self,*args): pass
                def headers_for_browser(self):
                    self.send_header("Access-Control-Allow-Origin","https://127.0.0.1:18088")
                    self.send_header("Access-Control-Allow-Headers","authorization,apikey,content-type,x-client-info,x-supabase-api-version")
                    self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS")
                    self.send_header("Content-Type","application/json")
                def do_OPTIONS(self):
                    self.send_response(204);self.headers_for_browser();self.end_headers()
                def forward(self):
                    if self.path.split('?')[0] not in ['/auth/v1/token','/auth/v1/user','/auth/v1/logout']:
                        self.send_error(404);return
                    size=int(self.headers.get('Content-Length','0'))
                    if size>16384:self.send_error(413);return
                    body=self.rfile.read(size) if size else None
                    request=urllib.request.Request(origin+self.path.removeprefix('/auth/v1'),data=body,
                        method=self.command,headers={'Content-Type':'application/json','Authorization':self.headers.get('Authorization','')})
                    try:
                        response=client.open(request,timeout=5)
                    except urllib.error.HTTPError as error:response=error
                    with response:
                        data=response.read();self.send_response(response.code);self.headers_for_browser();self.end_headers();self.wfile.write(data)
                do_GET=forward
                do_POST=forward
            gateway=ThreadingHTTPServer(('127.0.0.1',18089),Gateway)
            threading.Thread(target=gateway.serve_forever,daemon=True).start()
            lab_env={**env,'CLIPS_ALLOW_LOOPBACK_AUTH':'1','VITE_CLIPS_GO_AUTH_URL':'http://127.0.0.1:18089',
                'VITE_CLIPS_GO_AUTH_KEY':'sb_publishable_local','CLIPS_INTERFACE_PASSWORD':password,
                'CLIPS_INTERFACE_NATIVE_PASSWORD':secrets.token_urlsafe(24),'CLIPS_INTERFACE_E2E':'1','CLIPS_INTERFACE_STOP':str(stop_file),
                'CLIPS_INTERFACE_DIST':str(checkout/'dist'),'CLIPS_INTERFACE_AUTH_URL':'http://127.0.0.1:18089',
                'CLIPS_INTERFACE_FFMPEG':str(root/'.local/clips-pilot-video/bin/ffmpeg'),
                'CLIPS_INTERFACE_ACCOUNT':json.dumps({'source_user_id':account['id'],'email':account['email'],
                    'display_name':'Homolog Owner','email_confirmed':True,'banned':False,'deleted':False,
                    'clips_instances':[{'org_id':'ae34523f-081b-4d6b-a6fb-31b05613f955',
                    'instance_id':'ae34523f-081b-4d6b-a6fb-31b05613f966','status':'active'}]})}
            subprocess.run(['npm','run','build','--','--mode','clips-go'],cwd=checkout,env=lab_env,check=True)
            interface_log=open(state/'interface.log','w')
            interface=subprocess.Popen(['go','test','-count=1','-run','^TestOfficialInterfaceServer$','-timeout','180s','./pilots/clips'],
                cwd=root,env=lab_env,stdout=interface_log,stderr=interface_log)
            for _ in range(150):
                if stop_file.with_suffix('.stop.ready').exists():break
                if interface.poll() is not None:raise RuntimeError('Interface test server stopped: '+(state/'interface.log').read_text()[-3000:])
                time.sleep(.1)
            else:raise RuntimeError('Interface test server did not start')
            subprocess.run(['node',str(root/'pilots/clips/verify-interface-local.mjs'),str(checkout)],env=lab_env,cwd=root,check=True,timeout=120)
    finally:
        if interface:
            stop_file.touch()
            try:interface.wait(timeout=10)
            except subprocess.TimeoutExpired:interface.terminate();interface.wait(timeout=5)
        if gateway:gateway.shutdown();gateway.server_close()
        if auth:
            auth.terminate()
            auth.wait(timeout=10)
        if started:
            run("pg_ctl", "-D", str(state / "pg"), "-m", "immediate", "-w", "stop")
