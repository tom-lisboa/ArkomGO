import {useEffect,useState,type FormEvent} from 'react';
import {Button} from './components/Button';
import {describe,request,type Session} from './api';

type Stage={stageId:string;stageName:string;displayOrder:number};
type Pipeline={id:string;name:string;description?:string;stagesBreakdown?:Stage[]};
type Card={id:string;title?:string;stageId:string;value?:number;probability?:number;status?:string;lossReason?:string|null};
type LossReasons={reasons:string[]|null;restricted:boolean};
const statusLabels:Record<string,string>={open:"Em aberto",won:"Ganho",lost:"Perdido"};
type Listing<T>={data:T[]};
type CardPage=Listing<Card>&{meta:{countPages:number}};
type CardStatusFilter=''|'open'|'won'|'lost';
type Contact={id:string;name?:string;email?:string;telephone?:string;edit_url?:string};
type ContactPage={data:Contact[];page:number;pages:number};
type ContactSearch={query:string;search_by:string;page:number};

export default function CRMConsole({session,onConversation}:{session:Session;onConversation:(id:string)=>void}){
 const [section,setSection]=useState<'board'|'contacts'>('board');
 const [pipelines,setPipelines]=useState<Pipeline[]>([]);
 const [pipelineId,setPipeline]=useState('');
 const [cards,setCards]=useState<Card[]>([]);
 const [cardQuery,setCardQuery]=useState({pipelineId:'',status:'' as CardStatusFilter,reason:'',page:1});
 const [cardPages,setCardPages]=useState(0);
 const [cardsLoading,setCardsLoading]=useState(false);
 const [cardRevision,setCardRevision]=useState(0);
 const [lossSettings,setLossSettings]=useState<{pipelineId:string;data:LossReasons}|null>(null);
 const [stage,setStage]=useState('');
 const [contact,setContact]=useState<Contact|null>(null);
 const [contacts,setContacts]=useState<ContactPage|null>(null);
 const [contactSearch,setContactSearch]=useState<ContactSearch>({query:'',search_by:'name',page:1});
 const [conversationId,setConversationId]=useState('');
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [available,setAvailable]=useState(false);
 const pipeline=pipelines.find(p=>p.id===pipelineId);
 const stages=[...(pipeline?.stagesBreakdown??[])].sort((a,b)=>a.displayOrder-b.displayOrder);
 const cardStatus=cardQuery.pipelineId===pipelineId?cardQuery.status:'';
 const cardReason=cardQuery.pipelineId===pipelineId?cardQuery.reason:'';
 const cardPage=cardQuery.pipelineId===pipelineId?cardQuery.page:1;
 const canWrite=session.identity.role!=='viewer';
 const lossReasons=lossSettings?.pipelineId===pipelineId?lossSettings.data:null;
 const run=async(action:()=>Promise<void>)=>{
  setBusy(true);setError('');setMessage('');
  try{await action()}catch(err){setError(describe(err))}finally{setBusy(false)}
 };
 const listPipelines=async(signal?:AbortSignal)=>{
  const result=await request<Listing<Pipeline>>('/v1/sdr/crm/pipelines.list',session,{},undefined,signal);
  setAvailable(true);setPipelines(result.data??[]);
  setPipeline(current=>result.data?.some(p=>p.id===current)?current:result.data?.[0]?.id??'');
 };
 useEffect(()=>{
  const controller=new AbortController();
  void listPipelines(controller.signal).catch(err=>{if(!controller.signal.aborted)setError(describe(err))});
  return ()=>controller.abort();
 },[session]);
 useEffect(()=>{setStage('')},[pipelineId]);
 useEffect(()=>{
  setCards([]);setCardPages(0);
  if(!pipelineId){setCardsLoading(false);return}
  const controller=new AbortController();
  setCardsLoading(true);
  void request<CardPage>('/v1/sdr/crm/cards.list',session,{
   pipeline_id:pipelineId,status:cardStatus,loss_reason:cardReason,page:cardPage
  },undefined,controller.signal)
   .then(result=>{
    if(controller.signal.aborted)return;
    const pages=result.meta.countPages;
    if(cardPage>Math.max(1,pages)){
     setCardQuery({pipelineId,status:cardStatus,reason:cardReason,page:Math.max(1,pages)});
     return;
    }
    setCards(result.data??[]);setCardPages(pages);
   })
   .catch(err=>{if(!controller.signal.aborted)setError(describe(err))})
   .finally(()=>{if(!controller.signal.aborted)setCardsLoading(false)});
  return ()=>controller.abort();
 },[session,pipelineId,cardStatus,cardReason,cardPage,cardRevision]);
 async function loadLossReasons(id:string,signal?:AbortSignal){
  const data=await request<LossReasons>('/v1/sdr/crm/pipelines.loss-reasons',session,{pipeline_id:id},undefined,signal);
  if(!signal?.aborted)setLossSettings({pipelineId:id,data});
 }
 useEffect(()=>{
  if(!pipelineId)return;
  const controller=new AbortController();
  void loadLossReasons(pipelineId,controller.signal).catch(err=>{if(!controller.signal.aborted)setError(describe(err))});
  return ()=>controller.abort();
 },[session,pipelineId]);
 useEffect(()=>{
  if(!available)return;
  const controller=new AbortController();
  void request<ContactPage>('/v1/sdr/crm/contacts.list',session,contactSearch,undefined,controller.signal)
   .then(result=>{if(!controller.signal.aborted)setContacts(result)})
   .catch(err=>{if(!controller.signal.aborted)setError(describe(err))});
  return ()=>controller.abort();
 },[available,session,contactSearch]);
 function searchContacts(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  setError('');setContacts(null);
  setContactSearch({query:String(form.get('query')??''),search_by:String(form.get('search_by')??'name'),page:1});
 }
 function selectContact(item:Contact){
  setContact(item);setConversationId('');
  setMessage('Contato selecionado para a oportunidade.');
 }

 function createContact(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  void run(async()=>{
   const result=await request<{leadId:string;conversationId:string}>('/v1/sdr/crm/contacts.create',session,{name:form.get('name'),email:form.get('email')});
   setContact({id:result.leadId,name:String(form.get('name')??''),email:String(form.get('email')??'')});setContactSearch(current=>({...current}));setConversationId(result.conversationId);setMessage('Contato cadastrado no Clickmax e vinculado à Bia.');
  });
 }
 function createPipeline(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  void run(async()=>{
   const result=await request<{id:string}>('/v1/sdr/crm/pipelines.create',session,{name:form.get('name'),stages:String(form.get('stages')??'').split('\n').map(s=>s.trim()).filter(Boolean)});
   await listPipelines();setPipeline(result.id);setMessage('Pipeline criado.');
  });
 }
 function moveCard(card:Card,stageId:string){
  void run(async()=>{
   await request('/v1/sdr/crm/cards.move',session,{card_id:card.id,stage_id:stageId});
   setCards(current=>current.map(item=>item.id===card.id?{...item,stageId}:item));
   setMessage('Oportunidade movida.');
  });
 }
 function updatePipeline(event:FormEvent<HTMLFormElement>,id:string){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  void run(async()=>{
   await request('/v1/sdr/crm/pipelines.update',session,{pipeline_id:id,name:form.get('name'),description:form.get('description')});
   await listPipelines();
   setMessage('Pipeline atualizado.');
  });
 }
 function updateStage(event:FormEvent<HTMLFormElement>,id:string){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  void run(async()=>{
   await request('/v1/sdr/crm/stages.update',session,{stage_id:id,name:form.get('name')});
   await listPipelines();
   setMessage('Etapa atualizada.');
  });
 }
 function updateCard(event:FormEvent<HTMLFormElement>,id:string){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const amount=String(form.get('amount')??'');
  const probability=String(form.get('probability')??'');
  void run(async()=>{
   const updated=await request<Card>('/v1/sdr/crm/cards.update',session,{
    card_id:id,title:form.get('title'),
    ...(amount!==''?{value_cents:Math.round(Number(amount)*100)}:{}),
    ...(probability!==''?{probability:Number(probability)}:{})
   });
   setCards(current=>current.map(item=>item.id===id?{...item,...updated}:item));
   setMessage('Oportunidade atualizada.');
  });
 }

 function saveLossReasons(event:FormEvent<HTMLFormElement>,id:string){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const reasons=String(form.get('reasons')??'').split('\n').map(reason=>reason.trim()).filter(Boolean);
  const restricted=form.has('restricted');
  if(restricted&&!reasons.length){setError('Cadastre pelo menos um motivo para restringir a escolha.');return}
  void run(async()=>{
   const data=await request<LossReasons>('/v1/sdr/crm/pipelines.loss-reasons.update',session,{pipeline_id:id,reasons,restricted});
   setLossSettings({pipelineId:id,data});
   setMessage('Motivos de perda atualizados.');
  });
 }

 function closeCard(id:string,status:'won'|'lost',reason?:string){
  void run(async()=>{
   await request('/v1/sdr/crm/cards.close',session,{
    card_id:id,status,...(status==='lost'?{loss_reason:reason}:{})
   });
   setCardRevision(current=>current+1);
   setMessage(status==='won'?'Oportunidade marcada como ganha.':'Oportunidade marcada como perdida.');
  });
 }

 function createCard(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!contact)return;
  const form=new FormData(event.currentTarget);
  void run(async()=>{
   await request('/v1/sdr/crm/cards.create',session,{pipeline_id:pipelineId,stage_id:stage,lead_id:contact.id,title:form.get('title')});
   setCardRevision(current=>current+1);setMessage('Oportunidade criada.');
  });
 }
 return <main className="lab-audit demo-crm">
  <div className="lab-section-head"><div><p className="eyebrow">Sua empresa</p><h1 className="text-h2">CRM Arkom</h1></div>
   <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{
    await listPipelines();
    if(pipelineId){
     setCardRevision(current=>current+1);
     await loadLossReasons(pipelineId);
    }
   })}>Atualizar</Button>
  </div>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <nav className="demo-crm-tabs" aria-label="Áreas do CRM"><button aria-current={section==='board'?'page':undefined} onClick={()=>setSection('board')}>Oportunidades</button><button aria-current={section==='contacts'?'page':undefined} onClick={()=>setSection('contacts')}>Contatos</button></nav>
  {available&&<>
   <div hidden={section!=='contacts'}>
   <section aria-label="Contatos">
    <h2>Contatos</h2>
    <form onSubmit={searchContacts}>
     <label>Buscar por<select name="search_by"><option value="name">Nome</option><option value="email">E-mail</option><option value="telephone">Telefone</option></select></label>
     <label>Busca<input name="query" maxLength={254} placeholder="Deixe em branco para listar todos"/></label>
     <Button type="submit">Buscar contatos</Button>
    </form>
    {contacts&&<>
     {contacts.data.length===0?<p>Nenhum contato encontrado.</p>:<ul>
      {contacts.data.map(item=><li key={item.id}>
       <strong>{item.name||item.email||item.telephone||'Contato sem nome'}</strong>
       {item.email&&<span> · {item.email}</span>}{item.telephone&&<span> · {item.telephone}</span>}
       {canWrite&&<Button size="sm" type="button" variant="outline" aria-pressed={contact?.id===item.id} onClick={()=>selectContact(item)}>Selecionar para oportunidade</Button>}
       {canWrite&&item.edit_url&&<a href={item.edit_url} target="_blank" rel="noreferrer">Editar no Clickmax</a>}
      </li>)}
     </ul>}
     {contacts.pages>1&&<div aria-label="Páginas de contatos">
      <Button type="button" variant="outline" disabled={contacts.page<=1} onClick={()=>setContactSearch(current=>({...current,page:contacts.page-1}))}>Anterior</Button>
      <span> Página {contacts.page} de {contacts.pages} </span>
      <Button type="button" variant="outline" disabled={contacts.page>=contacts.pages} onClick={()=>setContactSearch(current=>({...current,page:contacts.page+1}))}>Próxima</Button>
     </div>}
    </>}
   </section>
   {canWrite&&<form className="card-premium" onSubmit={createContact}><h2>Novo contato</h2>
    <label>Nome<input name="name" maxLength={100} required/></label>
    <label>E-mail<input name="email" type="email" maxLength={254} required/></label>
    <Button type="submit" disabled={busy}>Cadastrar contato</Button>
    {conversationId&&<Button type="button" variant="outline" onClick={()=>onConversation(conversationId)}>Abrir conversa na Bia</Button>}
   </form>}
   </div>
   <div hidden={section!=='board'}>
   {session.identity.role==='admin'&&<details className="demo-crm-config"><summary>Criar um funil</summary><form className="card-premium" onSubmit={createPipeline}><h2>Novo pipeline</h2>
    <label>Nome<input name="name" maxLength={100} required/></label>
    <label>Etapas, uma por linha<textarea name="stages" required placeholder={'Entrada\nQualificado\nProposta'}/></label>
    <Button type="submit" disabled={busy}>Criar pipeline</Button>
   </form></details>}
   <label>Funil<select value={pipelineId} onChange={e=>setPipeline(e.target.value)}>
    <option value="">Selecione um funil</option>{pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
   {pipeline&&session.identity.role==='admin'&&<details key={pipeline.id+'-edit'}>
    <summary>Configurar este funil</summary>
    <form onSubmit={event=>updatePipeline(event,pipeline.id)}>
     <label>Nome<input name="name" defaultValue={pipeline.name} maxLength={100} required/></label>
     <label>Descrição<textarea name="description" defaultValue={pipeline.description??''} maxLength={500}/></label>
     <Button type="submit" disabled={busy}>Salvar pipeline</Button>
    </form>
   </details>}
   {pipeline&&lossReasons&&session.identity.role==='admin'&&<details key={pipeline.id+'-loss-reasons'}>
    <summary>Configurar motivos de perda</summary>
    <form key={JSON.stringify(lossReasons)} onSubmit={event=>saveLossReasons(event,pipeline.id)}>
     <label>Motivos, um por linha<textarea name="reasons" defaultValue={(lossReasons.reasons??[]).join('\n')}/></label>
     <label><input type="checkbox" name="restricted" defaultChecked={lossReasons.restricted}/> Restringir a escolha aos motivos cadastrados</label>
     <Button type="submit" disabled={busy}>Salvar motivos</Button>
    </form>
   </details>}
   {pipelineId&&canWrite&&<details className="demo-crm-create"><summary>＋ Nova oportunidade</summary><form className="card-premium" onSubmit={createCard}><h2>Nova oportunidade</h2>
    <label>Título<input name="title" maxLength={200} required/></label>
    <p>{contact?<>Contato selecionado <strong>{contact.name||contact.email||contact.telephone||'Contato sem nome'}</strong></>:<button type="button" onClick={()=>setSection("contacts")}>Escolher um contato →</button>}</p>
    <label>Etapa<select value={stage} onChange={e=>setStage(e.target.value)} required>
     <option value="">Selecione uma etapa</option>{stages.map(s=><option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
    </select></label>
    <Button type="submit" disabled={busy||!contact}>Criar oportunidade</Button>
   </form></details>}
   {pipelineId&&<section aria-label="Filtros de oportunidades">
    <h2>Oportunidades</h2>
    <label>Status<select value={cardStatus} onChange={event=>{
     setError('');
     setCardQuery({pipelineId,status:event.target.value as CardStatusFilter,reason:'',page:1});
    }}>
     <option value="">Todos</option><option value="open">Em aberto</option>
     <option value="won">Ganho</option><option value="lost">Perdido</option>
    </select></label>
    {cardStatus==='lost'&&<form key={pipelineId+cardReason} onSubmit={event=>{
     event.preventDefault();
     const reason=String(new FormData(event.currentTarget).get('loss_reason')??'').trim();
     setError('');
     setCardQuery({pipelineId,status:'lost',reason,page:1});
    }}>
     <label>Filtrar por motivo da perda<input name="loss_reason" maxLength={500} list="crm-loss-filter-options" defaultValue={cardReason}/></label>
     <datalist id="crm-loss-filter-options">{(lossReasons?.reasons??[]).map(reason=><option key={reason} value={reason}/>)}</datalist>
     <Button type="submit" disabled={cardsLoading}>Filtrar</Button>
     {cardReason&&<Button type="button" variant="outline" onClick={()=>setCardQuery({pipelineId,status:'lost',reason:'',page:1})}>Limpar motivo</Button>}
    </form>}
    {cardsLoading?<p role="status">Carregando oportunidades…</p>:cards.length===0&&<p>Nenhuma oportunidade encontrada.</p>}
    {cardPages>1&&<div aria-label="Páginas de oportunidades">
     <Button type="button" variant="outline" disabled={cardPage<=1} onClick={()=>setCardQuery({pipelineId,status:cardStatus,reason:cardReason,page:cardPage-1})}>Anterior</Button>
     <span> Página {cardPage} de {cardPages} </span>
     <Button type="button" variant="outline" disabled={cardPage>=cardPages} onClick={()=>setCardQuery({pipelineId,status:cardStatus,reason:cardReason,page:cardPage+1})}>Próxima</Button>
    </div>}
   </section>}
   <div className="demo-kanban" aria-label="Quadro de oportunidades">{stages.map(s=><section className="demo-kanban-column" key={s.stageId}><h2>{s.stageName}<span>{cards.filter(c=>c.stageId===s.stageId).length}</span></h2>
    {session.identity.role==='admin'&&<details><summary>Editar etapa</summary>
     <form onSubmit={event=>updateStage(event,s.stageId)}>
      <label>Nome<input name="name" defaultValue={s.stageName} maxLength={100} required/></label>
      <Button type="submit" disabled={busy}>Salvar etapa</Button>
     </form>
    </details>}
    <ul>
    {cards.filter(c=>c.stageId===s.stageId).map(c=><li className="demo-opportunity" key={c.id}><strong>{c.title||'Oportunidade'}</strong><span className="demo-card-state">{statusLabels[c.status??'open']??c.status}</span>
    {c.status==='lost'&&c.lossReason&&<p>Motivo da perda: {c.lossReason}</p>}
    {canWrite&&<select aria-label={`Etapa de ${c.title||'oportunidade'}`} value={c.stageId} disabled={busy} onChange={e=>moveCard(c,e.target.value)}>
     {stages.map(target=><option key={target.stageId} value={target.stageId}>{target.stageName}</option>)}
    </select>}{canWrite&&<details><summary>Editar oportunidade</summary>
     <form onSubmit={event=>updateCard(event,c.id)}>
      <label>Título<input name="title" defaultValue={c.title??''} maxLength={200} required/></label>
      <label>Valor (R$)<input name="amount" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={c.value==null?'':c.value/100}/></label>
      <label>Probabilidade (%)<input name="probability" type="number" min="0" max="100" step="1" defaultValue={c.probability??''}/></label>
      <Button type="submit" disabled={busy}>Salvar oportunidade</Button>
     </form>
    </details>}{canWrite&&<details><summary>Registrar resultado</summary>
     {c.status!=='won'&&<Button type="button" disabled={busy} onClick={()=>closeCard(c.id,'won')}>Marcar como ganho</Button>}
     {lossReasons?<form onSubmit={event=>{
      event.preventDefault();
      closeCard(c.id,'lost',String(new FormData(event.currentTarget).get('reason')??''));
     }}>
      <label>Motivo da perda{lossReasons.restricted?
       <select name="reason" required defaultValue={c.lossReason??''}>
        <option value="">Selecione o motivo</option>
        {(lossReasons.reasons??[]).map(reason=><option key={reason} value={reason}>{reason}</option>)}
       </select>:
       <input name="reason" required maxLength={500} defaultValue={c.lossReason??''}/>}
      </label>
      <Button type="submit" disabled={busy||(lossReasons.restricted&&!lossReasons.reasons?.length)}>Marcar como perdido</Button>
     </form>:<p>Atualize o pipeline para carregar os motivos de perda.</p>}
    </details>}</li>)}
   </ul></section>)}</div>
   <p className="demo-note">O quadro mostra as oportunidades da página e dos filtros selecionados.</p>
   </div>
  </>}
 </main>;
}
