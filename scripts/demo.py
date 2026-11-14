#!/usr/bin/env python3
"""Loopback-only demo launcher. Private state stays in .local/runtime."""
import base64,os,secrets,shutil,signal,socket,subprocess,sys,time
from urllib.parse import urlparse
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
calendar=env.get('ARKOM_CALENDAR_LOCAL_ENABLED','true')=='true'
customer_data=env.get('ARKOM_CUSTOMER_DATA_LOCAL_ENABLED','true')=='true'
media=env.get('ARKOM_MEDIA_LOCAL_ENABLED','false')=='true'
media_bin=Path(env['ARKOM_MEDIA_BIN']).expanduser().resolve() if env.get('ARKOM_MEDIA_BIN') else None
media_path=(str(media_bin)+os.pathsep if media_bin else '')+env.get('PATH','')
if media and not all(shutil.which(tool,path=media_path) for tool in ('ffmpeg','ffprobe')):
 sys.exit('Mídia da BIA exige ffmpeg e ffprobe no PATH ou no diretório ARKOM_MEDIA_BIN.')
whatsapp_root=None
if env.get('ARKOM_WHATSAPP_ENGINE_ROOT'):
 whatsapp_root=Path(env['ARKOM_WHATSAPP_ENGINE_ROOT']).expanduser().resolve()
 if not all((whatsapp_root/file).is_file() for file in ('go.mod','cmd/sdr-whatsapp-engine/main.go','cmd/wa-gateway-service/main.go')):
  sys.exit('Confira ARKOM_WHATSAPP_ENGINE_ROOT no .env local.')
 pg_bin=Path(env.get('ARKOM_LOCAL_PG_BIN') or '/opt/homebrew/opt/postgresql@17/bin')
 if not all((pg_bin/tool).is_file() for tool in ('postgres','initdb','pg_isready','psql')):
  sys.exit('WhatsApp local exige os binários do PostgreSQL. Configure ARKOM_LOCAL_PG_BIN.')
worker_secrets=['context-worker','execution-worker']
if calendar:worker_secrets.append('calendar-worker')
if media:worker_secrets.append('media-worker')
if whatsapp_root:worker_secrets.append('whatsapp-engine')
for name in worker_secrets:
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
clips=env.get('ARKOM_CLIPS_LOCAL_ENABLED')=='true'
if clips:
 ffmpeg=Path(env.get('ARKOM_CLIPS_FFMPEG','')).expanduser()
 if not ffmpeg.is_file():sys.exit('CLIPS exige ARKOM_CLIPS_FFMPEG apontando para um FFmpeg local. Veja docs/EXECUTAR.md.')
 env['CLIPS_PILOT_FFMPEG']=str(ffmpeg.resolve())
 keyfile=secret_dir/'clips-bridge'
 if not keyfile.exists():keyfile.write_text(secrets.token_urlsafe(48));keyfile.chmod(0o600)
 env['SDR_CLIPS_BRIDGE_KEY']=keyfile.read_text().strip()
 sealfile=secret_dir/'clips-gif-seal'
 if not sealfile.exists():
  with sealfile.open('x') as f:f.write(base64.b64encode(secrets.token_bytes(32)).decode('ascii'))
  sealfile.chmod(0o600)
 env['CLIPS_GIF_SEAL_FILE']=str(sealfile)
multi_root=None
env.pop('ARKOM_MULTI_STATE_DIR',None)
if env.get('ARKOM_MULTI_HOMOLOG_ROOT'):
 multi_root=Path(env['ARKOM_MULTI_HOMOLOG_ROOT']).expanduser().resolve()
 if not all((multi_root/file).is_file() for file in ['scripts/homolog/run.mjs','vite.homolog.config.ts','node_modules/vite/bin/vite.js']):
  sys.exit('Multipropriedades: confira o checkout e instale suas dependências. Veja docs/ECOSISTEMA-LOCAL-FLUTTER.md.')
 env['ARKOM_MULTI_STATE_DIR']=str(multi_root/'.homolog')
finance_root=None
env.pop('ARKOM_FINANCEAI_STATE_DIR',None)
if env.get('ARKOM_FINANCEAI_ROOT'):
 finance_root=Path(env['ARKOM_FINANCEAI_ROOT']).expanduser().resolve()
 if not all((finance_root/file).is_file() for file in ['cmd/api/main.go','frontend/node_modules/.bin/vite','examples/lovable/session.ts']):
  sys.exit('FinanceAI: confira o checkout e instale as dependências do frontend.')
 env['ARKOM_FINANCEAI_STATE_DIR']=str(run/'financeai')
ports=[3007,8080,8081,8099]+([8098] if crm else [])+([18082] if clips else [])
if whatsapp_root:ports.extend((18083,18084,55496))
for port in ports:
 with socket.socket() as check:
  check.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
  try:check.bind(('127.0.0.1',port))
  except OSError:sys.exit(f'Porta {port} ocupada. Encerre a demo anterior antes de iniciar outra.')
for name in ['bia','deeph']+(['crm'] if crm else []):
 if not (root/'.local/bin'/name).is_file():sys.exit('Execute python3 scripts/build-demo.py primeiro.')
for path in ['apps/genesis_flutter/build/web/index.html','apps/agents/bia/dist/index.html']:
 if not (root/path).is_file():sys.exit('Compile a plataforma e o agente BIA com scripts/build-demo.py antes de iniciar.')
workspace=run/'deeph'
shutil.copytree(root/'services/sdr/demo/deeph',workspace,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.deeph'))
env.update(SDR_CRM_DEV_ENABLED='true',SDR_GENESIS_DEMO='true',SDR_PIPELINE_ENABLED='true',SDR_OPENAI_MODEL=env.get('SDR_OPENAI_MODEL') or 'gpt-5.4-mini',SDR_LOCAL_SECRETS_DIR=str(secret_dir),SDR_LOCAL_WORKER_LISTEN='127.0.0.1:8081',SDR_DEEPH_WORKSPACE=str(workspace),ARKOM_CRM_DEV_LISTEN='127.0.0.1:8098',ARKOM_LOCAL_DEMO='true')
# This local stage uses our native calendar only; external OAuth is not adopted implicitly.
env['SDR_CALENDAR_ENABLED']='true' if calendar else 'false'
for key in ['SDR_GOOGLE_CALENDAR_CONFIG_FILE','SDR_GOOGLE_CALENDAR_KEY_FILE']:env.pop(key,None)
env['ARKOM_FRONTEND_TOOLCHAIN']=str(root/'packages/genesis-frontend')
env['PATH']=str(root/'.local/bin')+os.pathsep+env.get('PATH','')
# Other optional channels are not enabled by this launcher.
for flag in ['SDR_VOICE_ENABLED','SDR_METRICS_ENABLED']:env[flag]='false'
env['SDR_CUSTOMER_DATA_ENABLED']='true' if customer_data else 'false'
env['SDR_MEDIA_ENABLED']='true' if media else 'false'
env.pop('SDR_WHATSAPP_ENGINE_URL',None)
env.pop('SDR_WHATSAPP_ENGINE_TOKEN_FILE',None)
if whatsapp_root:
 env['SDR_WHATSAPP_ENGINE_URL']='http://127.0.0.1:18083'
 env['SDR_WHATSAPP_ENGINE_TOKEN_FILE']=str(secret_dir/'whatsapp-engine')
bia=str(root/'.local/bin/bia')
commands=([('crm',[str(root/'.local/bin/crm')],run)] if crm else [])+[
 ('api',[bia],run),('context',[bia,'-worker=context'],run),('execution',[bia,'-worker=execution'],run)]
if calendar:commands.append(('calendar',[bia,'-worker=calendar'],run))
if media:commands.append(('media',[bia,'-worker=media'],run))
if whatsapp_root:
 commands.append(('whatsapp',[sys.executable,str(root/'scripts/whatsapp/run.py'),str(whatsapp_root),str(run/'whatsapp'),str(pg_bin),str(secret_dir/'whatsapp-engine')],run))
commands.append(('web',[bia,'-web'],run))
pg_command=[]
if crm and env.get('ARKOM_CRM_LOCAL_PG_DATA'):
 data=Path(env['ARKOM_CRM_LOCAL_PG_DATA']).expanduser().resolve()
 pg_bin=Path(env.get('ARKOM_LOCAL_PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
 url=urlparse(env['ARKOM_CRM_DATABASE_URL'])
 if url.hostname!='127.0.0.1' or not url.port or not (data/'PG_VERSION').is_file():sys.exit('O banco CRM gerenciado deve ser um cluster local existente e uma porta explícita de loopback.')
 status=subprocess.run([str(pg_bin/'pg_ctl'),'-D',str(data),'status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if status.returncode!=0:pg_command=[('postgres',[str(pg_bin/'postgres'),'-D',str(data),'-h','127.0.0.1','-p',str(url.port)],run)]
commands=pg_command+([('clips',['bash',str(root/'services/core/pilots/clips/run-local.sh'),'--studio'],root/'services/core')] if clips else [])+commands
maia_finance=bool(multi_root and finance_root)
if finance_root:
 if maia_finance:(run/'financeai'/'maia.json').unlink(missing_ok=True)
 commands.append(('financeai',[sys.executable,str(root/'scripts/financeai/run.py'),str(finance_root),str(run/'financeai'),env.get('ARKOM_LOCAL_PG_BIN') or '/opt/homebrew/opt/postgresql@17/bin']+(['--maia'] if maia_finance else []),run))
if multi_root:
 commands.append(('multipropriedades',[sys.executable,str(root/'scripts/multipropriedades/run.py'),str(multi_root),str(root/'.local/bin/multi-api')]+([str(run/'financeai'/'maia.json')] if maia_finance else []),run))
processes=[];logs=[]
def stop(signum,frame):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
exit_code=0
try:
 for name,args,cwd in commands:
  log=(run/(name+'.log')).open('a');logs.append(log)
  child_env=env
  if name in ('calendar','media'):
   child_env={key:env[key] for key in ['PATH','SYSTEMROOT','TMPDIR','SDR_CRM_DEV_ENABLED','SDR_LOCAL_WORKER_LISTEN','SDR_LOCAL_SECRETS_DIR'] if key in env}
  if name=='media':
   child_env.update(
    PATH=media_path,
    OPENAI_API_KEY=env['OPENAI_API_KEY'],
    SDR_MEDIA_AUDIO_MODEL=env.get('SDR_MEDIA_AUDIO_MODEL') or 'gpt-transcribe',
    SDR_MEDIA_VISION_MODEL=env.get('SDR_MEDIA_VISION_MODEL') or env['SDR_OPENAI_MODEL'])
  if name=='web':
   child_env={key:env[key] for key in ['PATH','SYSTEMROOT','TMPDIR'] if key in env}
   child_env.update(ARKOM_LOCAL_DEMO='true',ARKOM_FLUTTER_BUILD=str(root/'apps/genesis_flutter/build/web'),ARKOM_BIA_BUILD=str(root/'apps/agents/bia/dist'))
  if name=='clips':
   child_env={**env,'CLIPS_LOCAL_GIF_PLATFORM_KEY':env['OPENAI_API_KEY']}
   child_env.pop('OPENAI_API_KEY',None)
  if name in ('multipropriedades','financeai','whatsapp'):
   child_env=os.environ.copy()
  processes.append((name,subprocess.Popen(args,cwd=cwd,env=child_env,stdout=log,stderr=log,start_new_session=True)))
  time.sleep(.5)
 print('Demo: http://127.0.0.1:3007/demo',flush=True)
 print('CLIPS: '+('ativado localmente; preparando o serviço de vídeo' if clips else 'não configurado'),flush=True)
 print('Agenda: '+('motor e worker próprios ativados; conexão Google não configurada' if calendar else 'desativada'),flush=True)
 print('WhatsApp: '+('preparando gateway local' if whatsapp_root else 'gateway não configurado'),flush=True)
 print('Mídia BIA: '+('worker ativado' if media else 'worker desativado'),flush=True)
 print('Meus dados: '+('exportação ativada' if customer_data else 'exportação desativada'),flush=True)
 print('CRM: '+('configurado; depende das rotas DEV provisionadas' if crm else 'não configurado; Genesis e SDR disponíveis'),flush=True)
 if multi_root:print('Multipropriedades: preparando a homologação local',flush=True)
 if finance_root:print('FinanceAI: preparando a homologação local',flush=True)
 while True:
  for name,p in processes[:]:
   if name in ('multipropriedades','financeai','whatsapp') and p.poll() is not None:
    print(f'{name} indisponível. Consulte .local/runtime/{name}.log.',file=sys.stderr,flush=True)
    processes.remove((name,p))
  failed=[name for name,p in processes if p.poll() is not None]
  if failed:
   print('Processo encerrado: '+', '.join(failed)+'. Consulte .local/runtime/*.log.',file=sys.stderr);exit_code=1;break
  time.sleep(1)
except KeyboardInterrupt:pass
finally:
 for name,p in reversed(processes):
  if p.poll() is not None:continue
  p.terminate()
  try:p.wait(timeout=25 if name=='clips' else 10)
  except subprocess.TimeoutExpired:
   os.killpg(p.pid,signal.SIGKILL);p.wait()
 for log in logs:log.close()
sys.exit(exit_code)
