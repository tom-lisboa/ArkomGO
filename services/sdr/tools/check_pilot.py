"""Check the deployed pilot without model calls, WhatsApp sends or business edits.

Only pilot login writes an access audit entry; all application checks are GET/HEAD.
Use --with-pilot-access to read the local, untracked fixture-code file in memory.
"""
from pathlib import Path
import argparse,datetime,json,re,time,urllib.request,urllib.error

root=Path(__file__).resolve().parents[1]
base='https://24.199.100.186/sdr-next'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--with-pilot-access',action='store_true')
args=parser.parse_args()
checks={}
def once_call(path,method='GET',token=None,body=None,headers=None):
    h=dict(headers or {})
    if token:h['Authorization']='Bearer '+token
    if body is not None:h['Content-Type']='application/json'
    req=urllib.request.Request(base+path,method=method,headers=h,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,dict(r.headers),r.read()
    except urllib.error.HTTPError as e:return e.code,dict(e.headers),e.read()
def call(path,method='GET',token=None,body=None,headers=None):
    for attempt in range(2):
        try:return once_call(path,method,token,body,headers)
        except (TimeoutError,urllib.error.URLError):
            if attempt:raise
            time.sleep(.5)
def get(path,token):
    code,_,raw=call(path,token=token)
    assert code==200,'Read failed: '+path+' HTTP '+str(code)
    return json.loads(raw)
def check(name,ok):
    checks[name]=bool(ok)
    assert ok,'Check failed: '+name

status,_,html=call('/')
check('pilot_https_available',status==200 and b'<html' in html.lower())
assets=re.findall(r'(?:src|href)="(/sdr-next/assets/[^"<>]+\.(?:js|css))"',html.decode())
check('compiled_client_assets_available',len(assets)>=2 and all(call(p.removeprefix('/sdr-next'),method='HEAD')[0]==200 for p in assets))
spec=get('/v1/platform/openapi.json',None)
check('public_contract_version',spec['info']['version']=='0.11.0')
check('private_worker_contract_not_exposed',not any('internal' in p for p in spec['paths']) and call('/internal/workers/execution/operation-claim')[0]==404)
check('session_required',call('/v1/platform/configuration')[0]==401)
origin='https://teste-cliente.lovable.app'
status,h,_=call('/v1/platform/executions',method='OPTIONS',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,idempotency-key'})
check('lovable_origin_allowed',status==204 and h.get('Access-Control-Allow-Origin')==origin)
check('unapproved_origin_refused',call('/v1/platform/openapi.json',headers={'Origin':'https://unapproved.example'})[0]==403)
companies={}
if args.with_pilot_access:
    codes=dict(re.findall(r'^- ([^:]+): `([^`]+)`',(root/'delivery/private/acessos-piloto.md').read_text(),re.M))
    for company in ['alfa','beta']:
        code,_,raw=call('/__test/ui/login',method='POST',body={'company':company,'role':'viewer','access_code':codes[company+'.viewer']})
        check(company+'_viewer_login',code==200)
        session=json.loads(raw);tok=session['access_token'];org='org_demo_'+company
        check(company+'_identity_scoped',session['identity']['organization_id']==org and session['identity']['role']=='viewer')
        runtime=get('/v1/sdr/runtime',tok)
        check(company+'_ai_and_workers_online',runtime['enabled'] and runtime['ai_enabled'] and all(w['online'] for w in runtime['workers'].values()))
        caps=get('/v1/platform/capabilities',tok)
        check(company+'_viewer_has_no_execution_or_config_permission',not caps['can_configure'] and not caps['can_execute'])
        workspace=get('/v1/platform/configuration',tok);context=get('/v1/core/solutions/sdr/context',tok)
        check(company+'_configuration_and_business_scoped',workspace['organization_id']==org and context['organization_id']==org)
        other='beta' if company=='alfa' else 'alfa'
        check(company+'_cross_company_conversation_refused',call('/v1/sdr/conversations/conv_demo_'+other,token=tok)[0]==404)
        whatsapp=get('/v1/sdr/whatsapp',tok)
        check(company+'_viewer_receives_no_pairing_secret',not whatsapp.get('qr_data_url') and not whatsapp.get('pairing_code'))
        companies[company]={'published_configuration_version':workspace['published']['version'],'business_version':context['business_version'],'model':runtime['model'],'whatsapp_status':whatsapp['status']}
    del codes
report={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'checks_count':len(checks),'checks':checks,'companies':companies,'provider_calls_requested':0,'whatsapp_messages_sent':0,'business_or_workflow_edits':0,'supabase_accessed':False,'lovable_remix_verified':False,'browser_ui_verified':False}
(root/'delivery/test-ready.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
