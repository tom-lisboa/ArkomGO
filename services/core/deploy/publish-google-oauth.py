#!/usr/bin/env python3
"""Publish Google OAuth without changing the SDR cadence or provider URLs.

--configure-only reads the two Google credentials from the private local .env,
activates them on the existing OAuth-capable release and recreates only the API.
Secrets travel through SSH stdin, never through command arguments or output.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import re
import shlex
import subprocess
import tarfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SSH = ["ssh", "-i", str(Path.home() / ".ssh/arkom_dev"), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "dev@24.199.100.186"]


def private_settings(names):
    result = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if key not in names:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key in result:
            raise SystemExit("Duplicate credential field in .env; resolve before publishing.")
        result[key] = value
    return result


def credentials():
    result = private_settings(("BIA_GOOGLE_CLIENT_ID", "BIA_GOOGLE_CLIENT_SECRET"))
    if not re.fullmatch(r"[A-Za-z0-9.-]{10,512}\.apps\.googleusercontent\.com", result.get("BIA_GOOGLE_CLIENT_ID", "")) or not re.fullmatch(r"[A-Za-z0-9._-]{10,1024}", result.get("BIA_GOOGLE_CLIENT_SECRET", "")):
        raise SystemExit("Fill both Google OAuth credentials in the private .env first.")
    return result


def clickmax_settings(path):
    key = private_settings(("BIA_CLICKMAX_API_KEY",)).get("BIA_CLICKMAX_API_KEY", "")
    if not re.fullmatch(r"cxp_[A-Za-z0-9_-]{8,512}", key):
        raise SystemExit("Save the ClickMax production API key in the private .env.")
    config = json.loads(path.read_text())
    uuid = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
    mapping = config["stage_map"]
    ids = [config["pipeline_id"], config["meeting_date_field"], config["meeting_time_field"], *mapping.values()]
    if not all(uuid.fullmatch(value) for value in ids) or not {"contact_pending", "booked"} <= mapping.keys():
        raise SystemExit("Invalid ClickMax production stage map or meeting fields.")
    return {
        "BIA_CLICKMAX_API_KEY": key,
        "BIA_CLICKMAX_PIPELINE_ID": config["pipeline_id"],
        "BIA_CLICKMAX_STAGE_MAP": json.dumps(mapping, separators=(",", ":")),
        "BIA_CLICKMAX_MEETING_DATE_FIELD": config["meeting_date_field"],
        "BIA_CLICKMAX_MEETING_TIME_FIELD": config["meeting_time_field"],
        "BIA_CLICKMAX_SYNC_ENABLED": "true",
    }


REMOTE = r'''
from pathlib import Path
from datetime import datetime, timedelta, timezone
import base64, fcntl, hashlib, json, os, secrets, shutil, subprocess, sys, tarfile, tempfile, urllib.request, urllib.error, urllib.parse
request = json.load(sys.stdin)
release, configure_only = request['release'], request['configure_only']
services = ['api','context','execution','media','scheduling','followup','voice']
lock = open('/var/lock/arkom-bia-deploy.lock','w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
current = Path('/opt/arkom-bia/current')
previous = current.resolve()
if not str(previous).startswith('/opt/arkom-bia/releases/r-'):
    raise SystemExit('Unexpected active release path.')
def compose(directory, *args, **kwargs):
    return subprocess.run(['docker','compose',*args],cwd=directory,check=True,**kwargs)
sql = "SELECT (SELECT count(*) FROM bia_go.voice_requests WHERE state IN ('requesting','dialing','queued','initiated','ringing','in-progress'))+(SELECT count(*) FROM bia_go.jobs j JOIN bia_go.leads l ON l.id=j.lead_id WHERE j.status='running' AND l.lease_until>now())+(SELECT count(*) FROM bia_go.worker_tasks WHERE status='running' AND lease_until>now())+(SELECT count(*) FROM bia_go.google_oauth_states WHERE started_at IS NOT NULL AND expires_at>now() AND (consumed_at IS NULL OR consumed_at>now()-interval '30 seconds'));"
active = compose(previous,'exec','-T','postgres','psql','-U','bia','-d','bia','-Atc',sql,capture_output=True,text=True).stdout.strip()
if active != '0':
    raise SystemExit('Active SDR work; retry after that operation finishes.')
if configure_only:
    try:
        r=urllib.request.urlopen('http://127.0.0.1:8080/v1/management/integrations/google/callback',timeout=10)
    except urllib.error.HTTPError as e:
        r=e
    with r:
        payload=json.load(r)
    if payload.get('error') not in ('google_not_configured','google_invalid_state'):
        raise SystemExit('Current release does not expose the Google OAuth callback.')
    destination = previous
else:
    destination = Path('/opt/arkom-bia/releases') / release
    destination.mkdir(mode=0o755,exist_ok=True)
    with tarfile.open('/tmp/'+release+'-google.tar.gz') as archive:
        for member in archive.getmembers():
            path=Path(member.name)
            if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                raise SystemExit('Unsafe release archive.')
        archive.extractall(destination,filter='data')
    actual=hashlib.sha256((destination/'bia').read_bytes()).hexdigest()
    if actual!=request['binary_sha256']:
        raise SystemExit('Uploaded binary digest mismatch.')
runtime=Path('/etc/arkom-bia/runtime.env')
old=runtime.read_text()
values=dict(line.split('=',1) for line in old.splitlines() if '=' in line and not line.startswith('#'))
backup_base=runtime.parent/'backups';backup_base.mkdir(mode=0o700,exist_ok=True)
backup=Path(tempfile.mkdtemp(prefix='google-',dir=backup_base))
shutil.copy2(runtime,backup/'runtime.env')
redirect='https://sdk.arkom.ai/v1/management/integrations/google/callback'
if values.get('BIA_GOOGLE_REDIRECT_URL') not in (None,'',redirect):
    raise SystemExit('Existing Google redirect differs; review before publishing.')
updates={'BIA_GOOGLE_REDIRECT_URL':redirect}
if request.get('booked_utility_content_sid'):
    sid=request['booked_utility_content_sid']
    auth=base64.b64encode((values['TWILIO_ACCOUNT_SID']+':'+values['TWILIO_AUTH_TOKEN']).encode()).decode()
    def twilio_content(path):
        req=urllib.request.Request('https://content.twilio.com/v1/Content/'+sid+path,headers={'Authorization':'Basic '+auth})
        with urllib.request.build_opener(NoRedirectContent()).open(req,timeout=15) as response:
            return json.load(response)
    class NoRedirectContent(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs): return None
    content=twilio_content('')
    approval=twilio_content('/ApprovalRequests').get('whatsapp') or {}
    if (approval.get('status')!='approved' or approval.get('category')!='UTILITY' or
            content.get('types',{}).get('twilio/text',{}).get('body')!=request['booked_utility_body']):
        raise SystemExit('Booked confirmation must be approved as UTILITY with the exact expected body.')
    updates['TWILIO_BOOKED_CONTACT_CONTENT_SID']=sid
    updates['TWILIO_BOOKED_QUESTION_CONTENT_SID']=sid
if request.get('clickmax_bia_attendant'):
    if not values.get('BIA_CLICKMAX_PIPELINE_ID') or not values.get('BIA_CLICKMAX_API_KEY'):
        raise SystemExit('ClickMax pipeline must be configured before enabling its intake.')
    updates['BIA_CLICKMAX_BIA_ATTENDANT_ID']=request['clickmax_bia_attendant']
if request.get('clickmax_go_tag'):
    updates['BIA_CLICKMAX_GO_TAG_ID']=request['clickmax_go_tag']
if request.get('enable_production_intake'):
    if values.get('BIA_MODE')!='live' or values.get('BIA_FORM_AUTO_CONTACT')!='true' or not values.get('TWILIO_WHATSAPP_FROM'):
        raise SystemExit('Production intake requires live automatic WhatsApp contact.')
    updates['BIA_INTAKE_TOKEN']=values.get('BIA_INTAKE_TOKEN') or secrets.token_hex(32)
for key in ['BIA_GOOGLE_CLIENT_ID','BIA_GOOGLE_CLIENT_SECRET']:
    if key not in values:
        updates[key]=''
if not values.get('BIA_GOOGLE_TOKEN_KEY'):
    updates['BIA_GOOGLE_TOKEN_KEY']=secrets.token_hex(32)
elif len(values['BIA_GOOGLE_TOKEN_KEY'])<32:
    raise SystemExit('Existing Google encryption key is invalid; review before publishing.')
if configure_only:
    updates.update(request['credentials'])
    updates['BIA_GOOGLE_ENABLED']='true'
else:
    updates['BIA_GOOGLE_ENABLED']=values.get('BIA_GOOGLE_ENABLED') or 'false'
if request.get('enable_scheduling'):
    if updates['BIA_GOOGLE_ENABLED']!='true':
        raise SystemExit('Google OAuth must be enabled before scheduling.')
    updates['BIA_GOOGLE_SCHEDULING_ENABLED']='true'
clickmax=request.get('clickmax')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
def read_clickmax(path,key):
    req=urllib.request.Request('https://mcp.clickmax.io/api/v0/'+path,headers={
        'Authorization':'Bearer '+key,'Accept':'application/json','User-Agent':'Go-http-client/1.1'})
    with urllib.request.build_opener(NoRedirect).open(req,timeout=12) as response:
        return json.load(response)
if clickmax:
    if values.get('BIA_MODE')!='live' or values.get('BIA_MANAGEMENT_ENABLED')!='true':
        raise SystemExit('ClickMax sync requires live mode and management.')
    try:
        pipelines=read_clickmax('pipelines/list',clickmax['BIA_CLICKMAX_API_KEY'])['data']
        fields=read_clickmax('custom-fields/list?entityType=opportunities',clickmax['BIA_CLICKMAX_API_KEY'])
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ClickMax production preflight failed with HTTP {e.code}.')
    pipeline=next((p for p in pipelines if p['id']==clickmax['BIA_CLICKMAX_PIPELINE_ID'] and not p.get('archivedAt')),None)
    if not pipeline or not set(json.loads(clickmax['BIA_CLICKMAX_STAGE_MAP']).values()) <= {v['stageId'] for v in pipeline['stagesBreakdown']}:
        raise SystemExit('ClickMax pipeline or stage IDs could not be verified.')
    fields={f['id']:f['fieldType'] for f in fields['data']}
    if fields.get(clickmax['BIA_CLICKMAX_MEETING_DATE_FIELD'])!='date' or fields.get(clickmax['BIA_CLICKMAX_MEETING_TIME_FIELD'])!='text':
        raise SystemExit('ClickMax meeting fields could not be verified.')
    updates.update(clickmax)
    cutoff=values.get('BIA_CLICKMAX_AUTO_LINK_SINCE') if values.get('BIA_CLICKMAX_PIPELINE_ID')==pipeline['id'] else ''
    updates['BIA_CLICKMAX_AUTO_LINK_SINCE']=cutoff or datetime.now(timezone.utc).isoformat(timespec='seconds')
public=request.get('clickmax_public')
if public:
    config={**values,**updates}
    if config.get('BIA_MODE')!='live' or config.get('BIA_CLICKMAX_SYNC_ENABLED')!='true' or not config.get('BIA_CLICKMAX_API_KEY'):
        raise SystemExit('ClickMax public scheduling requires the live CRM integration.')
    if json.loads(config.get('BIA_CLICKMAX_CALENDAR_ATTENDANTS') or '{}'):
        raise SystemExit('ClickMax public scheduling requires the team page to be the only new booking route.')
    current_time=datetime.now(timezone.utc)
    params=urllib.parse.urlencode({'pipelineId':config['BIA_CLICKMAX_PIPELINE_ID'],
        'startDate':(current_time-timedelta(days=30)).isoformat(),
        'endDate':(current_time+timedelta(days=14)).isoformat(),'includeInactiveCards':'true'})
    try:
        appointments=read_clickmax('scheduled-calls/list?'+params,config['BIA_CLICKMAX_API_KEY'])['data']
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ClickMax public calendar preflight failed with HTTP {e.code}.')
    if not any(a.get('appointmentScheduleId')==public['schedule'] and a.get('opportunityPipelineId')==config['BIA_CLICKMAX_PIPELINE_ID'] and a.get('origin')=='public_booking' for a in appointments):
        raise SystemExit('Could not verify public appointments on the configured pipeline and agenda.')
    same=values.get('BIA_CLICKMAX_PUBLIC_SCHEDULE_ID')==public['schedule']
    updates['BIA_CLICKMAX_PUBLIC_SCHEDULE_ID']=public['schedule']
    updates['BIA_SCHEDULING_URL']=public['url']
    updates['BIA_CLICKMAX_PUBLIC_SINCE']=(values.get('BIA_CLICKMAX_PUBLIC_SINCE') if same else '') or current_time.isoformat(timespec='seconds')
origins=[o.strip() for o in values.get('BIA_MANAGEMENT_ORIGINS','').split(',') if o.strip()]
for origin in ['https://sdk.arkom.ai','https://arkom-painelsdr.vercel.app']:
    if origin not in origins:origins.append(origin)
updates['BIA_MANAGEMENT_ORIGINS']=','.join(origins)
text='\n'.join(line for line in old.splitlines() if line.split('=',1)[0] not in updates)+'\n'
text+='\n'.join(k+'='+v for k,v in updates.items())+'\n'
with tempfile.NamedTemporaryFile(mode='w',dir=runtime.parent,delete=False) as stream:
    stream.write(text);stream.flush();os.fsync(stream.fileno());pending=Path(stream.name)
pending.chmod(0o600);os.replace(pending,runtime)
try:
    if configure_only:
        compose(destination,'up','-d','--no-deps','api')
    else:
        subprocess.run(['sh','activate.sh'],cwd=destination,check=True)
    subprocess.run(['curl','--fail','--silent','--show-error','--retry','15','--retry-all-errors','--retry-delay','1','--max-time','5','http://127.0.0.1:8080/readyz'],check=True)
    if request.get('enable_production_intake'):
        probe=urllib.request.Request('http://127.0.0.1:8080/webhooks/bia/leads',data=b'{}',headers={'Authorization':'Bearer '+updates['BIA_INTAKE_TOKEN'],'Content-Type':'application/json','Idempotency-Key':'intake-deploy-probe'})
        try:
            urllib.request.urlopen(probe,timeout=5).close()
        except urllib.error.HTTPError as e:
            if e.code!=422 or json.load(e).get('error')!='whatsapp_consent_required':
                raise SystemExit('Production intake validation probe failed.') from None
        else:
            raise SystemExit('Production intake accepted an invalid validation probe.')
    version=compose(destination,'exec','-T','postgres','psql','-U','bia','-d','bia','-Atc','SELECT max(version) FROM bia_go.schema_versions;',capture_output=True,text=True).stdout.strip()
    if (not configure_only and version!='28') or (configure_only and int(version)<20):raise SystemExit('Unexpected database schema version after publishing.')
except BaseException:
    shutil.copy2(backup/'runtime.env',runtime)
    if configure_only:
        compose(previous,'up','-d','--no-deps','api')
    else:
        compose(destination,'stop',*services)
        compose(previous,'up','-d',*services)
        pending=current.with_name('current-google-rollback');pending.unlink(missing_ok=True)
        pending.symlink_to(previous);pending.replace(current)
    raise
print(json.dumps({'release':destination.name,'schema':int(version),'google_enabled':updates['BIA_GOOGLE_ENABLED']=='true','configure_only':configure_only,'runtime_backup':str(backup),'voice_urls_preserved':True,'clickmax_sync_enabled':updates.get('BIA_CLICKMAX_SYNC_ENABLED',values.get('BIA_CLICKMAX_SYNC_ENABLED'))=='true','clickmax_public_enabled':bool(updates.get('BIA_CLICKMAX_PUBLIC_SCHEDULE_ID',values.get('BIA_CLICKMAX_PUBLIC_SCHEDULE_ID')))}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--configure-only", action="store_true")
    parser.add_argument("--enable-scheduling", action="store_true", help="Enable PostgreSQL and Google scheduling for the internal SDR")
    parser.add_argument("--clickmax-settings", type=Path, help="Enable ClickMax CRM sync using a verified pipeline map")
    parser.add_argument("--clickmax-public", nargs=2, metavar=("SCHEDULE_ID", "BOOKING_URL"), help="Use the existing ClickMax team booking page")
    parser.add_argument("--enable-production-intake", action="store_true", help="Provision the dedicated website lead intake secret")
    parser.add_argument("--clickmax-bia-attendant", help="Verified ClickMax Bia attendant UUID for pipeline intake")
    parser.add_argument("--clickmax-go-tag", help="Verified ClickMax ownership tag UUID")
    parser.add_argument("--booked-utility-content-sid", help="Activate the exact approved Utility booking confirmation")
    args = parser.parse_args()
    if args.configure_only and (args.enable_scheduling or args.clickmax_settings or args.clickmax_public or args.enable_production_intake):
        parser.error("Integration activation requires a full worker release")
    payload = {"configure_only": args.configure_only, "enable_scheduling": args.enable_scheduling, "release": "", "credentials": {}}
    payload["enable_production_intake"] = args.enable_production_intake
    if args.booked_utility_content_sid:
        if args.configure_only or not re.fullmatch(r'HX[0-9a-f]{32}',args.booked_utility_content_sid):
            parser.error('Utility confirmation requires a full release and a valid Content SID')
        payload['booked_utility_content_sid']=args.booked_utility_content_sid
        payload['booked_utility_body']=json.loads((ROOT/'deploy/booked-contact-template.json').read_text())['types']['twilio/text']['body']
    if args.clickmax_bia_attendant:
        if args.configure_only or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}",args.clickmax_bia_attendant):
            parser.error("Pipeline intake requires a full release and a verified attendant UUID")
        payload['clickmax_bia_attendant']=args.clickmax_bia_attendant
    if args.clickmax_go_tag:
        if args.configure_only or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}",args.clickmax_go_tag):
            parser.error("Ownership marker requires a full release and verified tag UUID")
        payload['clickmax_go_tag']=args.clickmax_go_tag
    if args.clickmax_settings:
        payload["clickmax"] = clickmax_settings(args.clickmax_settings)
    if args.clickmax_public:
        schedule, booking_url = args.clickmax_public
        url = urlsplit(booking_url)
        if (not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", schedule)
                or url.scheme != "https" or url.netloc != "app.clickmax.io"
                or not re.fullmatch(r"/book/[A-Za-z0-9-]+/[A-Za-z0-9-]+/?", url.path)
                or url.query or url.fragment):
            parser.error("ClickMax public scheduling requires a valid schedule UUID and ClickMax booking URL")
        payload["clickmax_public"] = {"schedule": schedule, "url": booking_url}
    if args.configure_only:
        payload["credentials"] = credentials()
    else:
        binary = ROOT / ".local/deploy/bia"
        payload["binary_sha256"] = hashlib.sha256(binary.read_bytes()).hexdigest()
        release = payload["release"] = "r-" + payload["binary_sha256"][:12]
        bundle = ROOT / ".local/deploy" / (release + "-google.tar.gz")
        with tarfile.open(bundle, "w:gz") as archive:
            archive.add(binary, arcname="bia")
            for name in ["compose.yaml", "Dockerfile.runtime", "activate.sh", "backup.sh", "arkom-bia-backup.service", "arkom-bia-backup.timer", "cadence", "quick-replies"]:
                archive.add(ROOT / "deploy" / name, arcname=name)
            raw = ("BIA_RELEASE=" + release + "\n").encode()
            info = tarfile.TarInfo(".env"); info.size = len(raw); info.mode = 0o600
            archive.addfile(info, io.BytesIO(raw))
        subprocess.run(["scp", "-i", str(Path.home() / ".ssh/arkom_dev"), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", str(bundle), "dev@24.199.100.186:/tmp/" + bundle.name], check=True, timeout=180)
    # Credentials are never part of the command line, stdout or a release file.
    subprocess.run(SSH + ["sudo python3 -c " + shlex.quote(REMOTE)], input=json.dumps(payload), text=True, check=True, timeout=360)


if __name__ == "__main__":
    main()
