#!/usr/bin/env python3
"""Indexa e exporta todos os Mermaids dos componentes sem alterar os originais."""
import hashlib,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'docs/mermaid';out.mkdir(parents=True,exist_ok=True)
entries=[]
for area in ['apps','services','packages']:
 for p in sorted((root/area).rglob('*')):
  if not p.is_file() or any(x in p.parts for x in ['node_modules','.next','.git','dist']):continue
  rel=p.relative_to(root).as_posix()
  if p.suffix=='.mmd':
   entries.append({'source':rel,'diagram':rel,'block':1});continue
  if p.suffix not in {'.md','.mdx'}:continue
  blocks=re.findall(r'```mermaid\s*\n(.*?)```',p.read_text(errors='replace'),re.S)
  for i,body in enumerate(blocks,1):
   name=f'{area}-{p.stem}-{hashlib.sha256(rel.encode()).hexdigest()[:8]}-{i:02}.mmd'
   target=out/'importados'/name;target.parent.mkdir(exist_ok=True)
   target.write_text(body.strip()+'\n')
   entries.append({'source':rel,'diagram':target.relative_to(root).as_posix(),'block':i})
for p in sorted(out.glob('*.mmd')):entries.insert(0,{'source':p.relative_to(root).as_posix(),'diagram':p.relative_to(root).as_posix(),'block':1})
(out/'catalog.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
lines=['# Diagramas Mermaid','',f'{len(entries)} diagramas indexados. As fontes anteriores são preservadas; blocos em Markdown também recebem uma cópia `.mmd` editável em `importados/`.','', 'Os diagramas herdados podem representar propostas ou versões anteriores. Consulte a origem e [o estado atual](../STATUS-E-ROADMAP.md) antes de tratá-los como descrição da demo.','', 'Para atualizar: `python3 scripts/catalog_mermaid.py`.','', '| Diagrama editável | Documento de origem |','| --- | --- |']
for e in entries:
 d=e['diagram'];s=e['source'];lines.append(f'| [{Path(d).name}](../../{d}) | [{s} — bloco {e["block"]}](../../{s}) |')
lines+=['','## Visão integrada da demo','', '```mermaid', (out/'01-demo-integrada.mmd').read_text().strip(), '```','']
(out/'README.md').write_text('\n'.join(lines))
print(f'{len(entries)} diagramas catalogados')
