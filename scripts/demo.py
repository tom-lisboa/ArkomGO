#!/usr/bin/env python3
"""Loopback-only demo launcher. Private state stays in .local/runtime."""
import os,secrets,shutil,signal,socket,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
env=os.environ.copy()
file=root/'.env'
if file.exists():
 for raw in file.read_text().splitlines():
  raw=raw.strip()
  if not raw or raw.startswith('#'):continue
  key,sep,value=raw.removeprefix('export ').partition('=')
  if sep:env[key.strip()]=value.strip().strip('"\'')
if not env.get('OPENAI_API_KEY'):sys.exit('Configure OPENAI_API_KEY em .env antes de iniciar.')
run=root/'.local/runtime';secret_dir=run/'secrets';secret_dir.mkdir(parents=True,exist_ok=True)
secret_dir.chmod(0o700)
for name in ['context-worker','execution-worker']:
 p=secret_dir/name
 if not p.exists():
  with p.open('x') as f:f.write(secrets.token_urlsafe(48))
  p.chmod(0o600)
crm=bool(env.get('SDR_CRM_ROUTES_FILE'))
if crm:
 route=Path(env['SDR_CRM_ROUTES_FILE']).expanduser()
 if not route.is_absolute():route=root/route
 if not route.is_file() or not env.get('ARKOM_CRM_DATABASE_URL'):sys.exit('CRM exige arquivo privado de rotas e ARKOM_CRM_DATABASE_URL provisionados. Veja docs/EXECUTAR.md.')
 env['SDR_CRM_ROUTES_FILE']=str(route)
ports=[3007,8080,8081,8099]+([8098] if crm else [])
for port in ports:
 with socket.socket() as check:
  check.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
  try:check.bind(('127.0.0.1',port))
  except OSError:sys.exit(f'Porta {port} ocupada. Encerre a demo anterior antes de iniciar outra.')
for name in ['bia','deeph']+(['crm'] if crm else []):
 if not (root/'.local/bin'/name).is_file():sys.exit('Execute python3 scripts/build-demo.py primeiro.')
if not (root/'apps/portal/node_modules/next/dist/bin/next').is_file():sys.exit('Instale as dependências do portal com scripts/build-demo.py.')
workspace=run/'deeph'
shutil.copytree(root/'services/sdr/demo/deeph',workspace,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.deeph'))
env.update(SDR_CRM_DEV_ENABLED='true',SDR_GENESIS_DEMO='true',SDR_PIPELINE_ENABLED='true',SDR_OPENAI_MODEL=env.get('SDR_OPENAI_MODEL') or 'gpt-5.4-mini',SDR_LOCAL_SECRETS_DIR=str(secret_dir),SDR_LOCAL_WORKER_LISTEN='127.0.0.1:8081',SDR_DEEPH_WORKSPACE=str(workspace),ARKOM_CRM_DEV_LISTEN='127.0.0.1:8098',ARKOM_LOCAL_DEMO='true')
env['PATH']=str(root/'.local/bin')+os.pathsep+env.get('PATH','')
# Other optional channels are not enabled by this launcher.
for flag in ['SDR_VOICE_ENABLED','SDR_CALENDAR_ENABLED','SDR_CUSTOMER_DATA_ENABLED','SDR_MEDIA_ENABLED','SDR_METRICS_ENABLED']:env[flag]='false'
bia=str(root/'.local/bin/bia')
commands=([('crm',[str(root/'.local/bin/crm')],run)] if crm else [])+[
 ('api',[bia],run),('context',[bia,'-worker=context'],run),('execution',[bia,'-worker=execution'],run),
 ('portal',['node',str(root/'apps/portal/node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3007'],root/'apps/portal')]
processes=[];logs=[]
def stop(signum,frame):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
exit_code=0
try:
 for name,args,cwd in commands:
  log=(run/(name+'.log')).open('a');logs.append(log)
  processes.append((name,subprocess.Popen(args,cwd=cwd,env=env,stdout=log,stderr=log)))
  time.sleep(.5)
 print('Demo: http://127.0.0.1:3007/demo',flush=True)
 print('CRM: '+('configurado; depende das rotas DEV provisionadas' if crm else 'não configurado; Genesis e SDR disponíveis'),flush=True)
 while True:
  failed=[name for name,p in processes if p.poll() is not None]
  if failed:
   print('Processo encerrado: '+', '.join(failed)+'. Consulte .local/runtime/*.log.',file=sys.stderr);exit_code=1;break
  time.sleep(1)
except KeyboardInterrupt:pass
finally:
 for _,p in processes:
  if p.poll() is None:p.terminate()
 for _,p in processes:
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 for log in logs:log.close()
sys.exit(exit_code)
