"""Read-only CLIPS migration inventory for the already verified customer.

Reads counts, asset sizes and configuration flags. Never reads provider keys,
passwords, session tokens, transcript text, or other customers' project content.
"""
import json
import os
import subprocess
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[3]
state = root / ".local/clips-parity"
state.mkdir(mode=0o700, exist_ok=True)
source = json.loads((root / ".local/clips-identity/source-account.json").read_text())["rows"]
assert len(source) == 1
account = source[0]
assert account["email_confirmed"] and not account["banned"] and not account["deleted"]
instances = account["clips_instances"]
assert len(instances) == 1 and instances[0]["status"] == "active"
user_id = str(uuid.UUID(account["source_user_id"]))
org_id = str(uuid.UUID(instances[0]["org_id"]))
instance_id = str(uuid.UUID(instances[0]["instance_id"]))
work = root / ".local/clips-identity/work"
assert (work / "supabase/.temp/project-ref").read_text().strip() == "auytmefqnuzbktyzcled"

query = f"""WITH identity AS (
 SELECT u.id AS user_id,m.org_id FROM auth.users u
 JOIN core.memberships m ON m.user_id=u.id
 JOIN core.app_instances i ON i.org_id=m.org_id AND i.solution='clips'
 WHERE u.id='{user_id}'::uuid AND m.org_id='{org_id}'::uuid
 AND i.instance_id='{instance_id}'::uuid AND i.status='active'
 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now())
), owned AS (
 SELECT p.id,p.storage_path,p.status FROM app_clips.projects p
 JOIN identity i ON p.user_id=i.user_id AND p.org_id=i.org_id
), sources AS (
 SELECT DISTINCT o.id,o.metadata FROM storage.objects o
 JOIN owned p ON o.bucket_id='clips-videos' AND o.name=p.storage_path
)
SELECT jsonb_build_object(
 'checked_at',now(),
 'source_project','auytmefqnuzbktyzcled',
 'authorized_identity_count',(SELECT count(*) FROM identity),
 'owned_projects',(SELECT count(*) FROM owned),
 'other_projects_in_same_org',(SELECT count(*) FROM app_clips.projects p JOIN identity i ON p.org_id=i.org_id WHERE p.user_id<>i.user_id),
 'owned_clips',(SELECT count(*) FROM app_clips.clips c JOIN owned p ON c.project_id=p.id WHERE c.org_id='{org_id}'::uuid),
 'owned_transcriptions',(SELECT count(*) FROM app_clips.transcriptions t JOIN owned p ON t.project_id=p.id WHERE t.org_id='{org_id}'::uuid),
 'project_statuses',COALESCE((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) AS n FROM owned GROUP BY status) s),'{{}}'::jsonb),
 'projects_with_source_path',(SELECT count(*) FROM owned WHERE storage_path IS NOT NULL),
 'source_objects_found',(SELECT count(*) FROM sources),
 'missing_source_objects',(SELECT count(*) FROM owned p WHERE p.storage_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='clips-videos' AND o.name=p.storage_path)),
 'source_bytes_from_metadata',COALESCE((SELECT sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::numeric ELSE 0 END) FROM sources),0),
 'largest_source_bytes_from_metadata',COALESCE((SELECT max(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::numeric ELSE 0 END) FROM sources),0),
 'speech_marked_configured',EXISTS(SELECT 1 FROM app_clips.app_settings s JOIN identity i ON s.org_id=i.org_id WHERE s.elevenlabs_configured),
 'speech_secret_registered',EXISTS(SELECT 1 FROM core.org_secrets s JOIN identity i ON s.org_id=i.org_id WHERE s.key='ELEVENLABS_API_KEY'),
 'video_worker_marked_configured',EXISTS(SELECT 1 FROM app_clips.app_settings s JOIN identity i ON s.org_id=i.org_id WHERE NULLIF(btrim(s.railway_ytdlp_url),'') IS NOT NULL)
) AS inventory;
"""
path = state / "inventory.sql"
path.write_text(query)
os.chmod(path, 0o600)
result = subprocess.run(["supabase","db","query","--linked","--workdir",str(work),"--file",str(path),"--output","json"],
    capture_output=True,text=True,cwd=root,timeout=60,check=True)
document = json.loads(result.stdout)
rows = document["rows"]
assert len(rows) == 1
inventory = rows[0]["inventory"]
assert inventory["authorized_identity_count"] == 1
report = state / "inventory.json"
report.write_text(json.dumps(inventory,indent=2))
os.chmod(report,0o600)
print(json.dumps(inventory,ensure_ascii=False))
