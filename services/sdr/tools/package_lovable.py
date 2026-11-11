"""Build the client-only ZIP from reviewed source files, never from the backend tree."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,zipfile

root=Path(__file__).resolve().parents[1]
target=root/'delivery/lovable-template'
subprocess.run(['python3',str(root/'delivery/build_platform_contract.py')],check=True)
shutil.copytree(root/'frontend/src',target/'src',dirs_exist_ok=True)
shutil.copy2(root/'docs/TESTAR.md',target/'TESTAR.md')
shutil.copy2(root/'docs/WHATSAPP.md',target/'WHATSAPP.md')
shutil.copy2(root/'docs/MIDIAS.md',target/'MIDIAS.md')
shutil.copy2(root/'docs/FLUXOS-DE-MIDIA.md',target/'FLUXOS-DE-MIDIA.md')
shutil.copy2(root/'docs/NOVIDADES-0.11.md',target/'NOVIDADES-0.11.md')
shutil.copy2(root/'docs/DADOS-DO-CLIENTE.md',target/'DADOS-DO-CLIENTE.md')
shutil.copy2(root/'docs/AGENDAS.md',target/'AGENDAS.md')
shutil.copy2(root/'customer-schema.graphql',target/'customer-schema.graphql')
subprocess.run(['npm','run','build'],cwd=target,check=True)
allowed={'src','DADOS-DO-CLIENTE.md','AGENDAS.md','customer-schema.graphql','README.md','LOVABLE.md','TESTAR.md','WHATSAPP.md','MIDIAS.md','FLUXOS-DE-MIDIA.md','NOVIDADES-0.11.md','ATUALIZAR-FRONT.md','platform-openapi.json','package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tailwind.config.ts','postcss.config.js','.gitignore'}
files=[p for p in target.rglob('*') if p.is_file() and p.relative_to(target).parts[0] in allowed]
codes=[]
for private in (root/'delivery/private').glob('*.md'):
    codes+=re.findall(r'^- [^:]+: `([^`]+)`',private.read_text(),re.M)
for p in files:
    raw=p.read_bytes()
    assert not p.is_symlink(),'No symlinks allowed in client package'
    assert not any(v.encode() in raw for v in codes),'Pilot code found in client package'
    assert not re.search(rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}',raw),'Provider credential pattern found'
    assert p.suffix not in {'.go','.db','.sqlite','.sqlite3','.pem','.key'},'Backend or private file found'
archive=root/'delivery/SDR-Next-Lovable-v0.13.0-candidato.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):z.write(p,p.relative_to(target))
# Candidate delivery never overwrites the already distributed stable Remix ZIP.
report={'version':'0.13.0-calendars-candidate','requires_backend_activation':True,'deployed':False,'path':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(files),'client_only':True,'contains_access_codes':False}
(root/'delivery/remix-package-v0.13.0.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
