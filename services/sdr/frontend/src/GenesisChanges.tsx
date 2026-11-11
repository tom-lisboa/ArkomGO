import {useEffect,useState} from 'react';
import {request,describe,type Session} from './api';
type Spec={required_fields:string[];title:string;reuses:string[]};
type Change={id:string;summary:string;status:string;spec:Spec;before:Spec;base_version:number;applied_version?:number;previewed:boolean;artifact:{source:string;tests:string;verified:boolean;digest:string}};
type Snapshot={changes:Change[];current:{version:number;spec:Spec};crm_connected:boolean;can_publish:boolean};
type Preview={before_qualified:boolean;after_qualified:boolean;missing:string[];effects_applied:false};
const labels:Record<string,string>={company:'Empresa',goal:'Objetivo',name:'Nome',segment:'Segmento',sellers:'Quantidade de vendedores',contact_volume:'Volume de contatos',current_tool:'Ferramenta atual'};
const base='/v1/sdr/genesis-demo/changes';
function ChangeCard({change,current,session,canPublish,refresh}:{change:Change;current:number;session:Session;canPublish:boolean;refresh:()=>Promise<void>}){
 const [facts,setFacts]=useState<Record<string,string>>({company:'Oficina Horizonte',goal:'Organizar vendas'}),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function act(kind:'preview'|'publish'|'restore'){
  setBusy(true);setError('');try{
   if(kind==='preview')setPreview(await request<Preview>(base+'/'+change.id+'/preview',session,{facts}));
   else await request(base+'/'+change.id+'/'+kind,session,{expected_version:current,reason:kind==='publish'?'Cliente aprovou a prévia no Genesis':'Cliente solicitou voltar à regra anterior no Genesis'});
   await refresh();
  }catch(e){setError(describe(e))}finally{setBusy(false)}
 }
 const stale=change.status==='ready'&&change.base_version!==current;
 return <section className="genesis-result genesis-change"><span className="eyebrow">{change.status==='published'?'ALTERAÇÃO PUBLICADA':change.status==='restored'?'REGRA ANTERIOR RESTAURADA':stale?'PRÉVIA DESATUALIZADA':'ALTERAÇÃO PRONTA PARA TESTAR'}</span><h2>{change.summary}</h2>
  <div className="genesis-change-diff"><div><b>Antes</b><p>{change.before.required_fields.map(f=>labels[f]??f).join(' · ')}</p><small>Oportunidade: {change.before.title}</small></div><div><b>Depois</b><p>{change.spec.required_fields.map(f=>labels[f]??f).join(' · ')}</p><small>Oportunidade: {change.spec.title}</small></div></div>
  <p>Usa a memória da Bia e a integração CRM da Arkom. {change.artifact.verified?'Código Go compilado e testes aprovados.':'Validação pendente.'}</p>
  {change.status==='ready'&&!stale&&<><h3>Experimente com um contato fictício</h3><p>Preencha ou deixe dados em branco para ver quando ele estaria pronto para o CRM.</p><div className="genesis-preview-fields">{Array.from(new Set([...change.before.required_fields,...change.spec.required_fields])).map(field=><label key={field}>{labels[field]??field}<input value={facts[field]??''} maxLength={500} onChange={e=>{setFacts({...facts,[field]:e.target.value});setPreview(null)}}/></label>)}</div><button disabled={busy||session.identity.role==='viewer'} onClick={()=>void act('preview')}>{busy?'Verificando…':'Testar esta regra'}</button>
  {preview&&<div className="genesis-preview-result" role="status"><p>Regra anterior: <b>{preview.before_qualified?'pronto para o CRM':'aguardaria mais informações'}</b>.</p><p>Nova regra: <b>{preview.after_qualified?'pronto para o CRM':'aguardaria '+preview.missing.map(f=>labels[f]??f).join(', ')}</b>.</p><small>Simulação concluída. Nenhum contato ou oportunidade foi criado.</small></div>}
  <p>A publicação vale para novas avaliações do atendimento. Oportunidades e envios já enfileirados permanecem como estão.</p>
  {canPublish?<button disabled={busy||!preview||!change.artifact.verified} onClick={()=>void act('publish')}>Aprovar e ativar esta regra</button>:<p>Um administrador da sua empresa pode aprovar esta alteração.</p>}</>}
  {stale&&<p>A regra da empresa mudou depois desta proposta. Peça ao Genesis uma nova versão antes de publicar.</p>}
  {change.status==='published'&&change.applied_version===current&&canPublish&&<><p>Você pode restaurar os critérios anteriores. Isso não desfaz oportunidades já criadas.</p><button disabled={busy} onClick={()=>void act('restore')}>Voltar à regra anterior</button></>}
  {error&&<p role="alert">{error}</p>}
  <details><summary>Detalhes da validação</summary><p>Backend Go · infraestrutura Arkom · {change.spec.reuses.join(', ')}</p><p>Artefato: {change.artifact.digest}</p><pre>{change.artifact.source}</pre><details><summary>Testes gerados</summary><pre>{change.artifact.tests}</pre></details></details>
 </section>
}
export default function GenesisChanges({session}:{session:Session}){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState('');
 async function load(){try{setData(await request<Snapshot>(base,session));setError('')}catch(e){setError(describe(e))}}
 useEffect(()=>{let active=true;async function poll(){try{const next=await request<Snapshot>(base,session);if(active){setData(next);setError('')}}catch(e){if(active)setError(describe(e))}}void poll();const timer=setInterval(()=>{if(!document.hidden)void poll()},2500);return()=>{active=false;clearInterval(timer)}},[session]);
 return <div aria-label="Alterações preparadas pelo Genesis">{error&&<p role="alert">{error}</p>}{data&&<><section className="genesis-result"><span className="eyebrow">REGRA ATIVA · VERSÃO {data.current.version}</span><h2>Quando enviar um interessado ao CRM?</h2><p>Quando informar: {data.current.spec.required_fields.map(f=>labels[f]??f).join(', ')}.</p><p>{data.crm_connected?'Integração CRM configurada para esta empresa.':'CRM ainda não está conectado. Você pode preparar a regra, mas o encaminhamento depende da configuração da integração.'}</p></section>{data.changes.map(change=><ChangeCard key={change.id} change={change} current={data.current.version} session={session} canPublish={data.can_publish} refresh={load}/>)}</>}</div>
}
