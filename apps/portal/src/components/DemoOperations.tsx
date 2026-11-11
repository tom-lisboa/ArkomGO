'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Activity,ArrowUpRight,RefreshCw} from 'lucide-react';
import {demoSession,forgetDemoSession} from './demo-runtime/session';
import {request,ApiError} from './demo-runtime/api';
type Snapshot={workers:number;ai:boolean;pipelines:number;executions:number;approvals:number;checked:string};
export default function DemoOperations(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let cancelled=false;
  async function load(){try{
   const session=await demoSession();
   const [runtime,crm,runs]=await Promise.all([
    request<{ai_enabled:boolean;workers?:Record<string,{online:boolean}>}>('/v1/sdr/runtime',session),
    request<{data:unknown[]}>('/v1/sdr/crm/pipelines.list',session,{}),
    request<{items:{status:string}[]}>('/v1/platform/executions?limit=30',session),
   ]);
   if(!cancelled){setError('');setSnapshot({workers:Object.values(runtime.workers??{}).filter(w=>w.online).length,ai:runtime.ai_enabled,pipelines:crm.data.length,executions:runs.items.length,approvals:runs.items.filter(r=>r.status==='waiting_approval').length,checked:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})})}
  }catch(e){if(e instanceof ApiError&&e.status===401)forgetDemoSession();if(!cancelled)setError('Não foi possível atualizar o estado da operação.')}}
  void load();const interval=setInterval(()=>{if(!document.hidden)void load()},30000);return()=>{cancelled=true;clearInterval(interval)};
 },[refresh]);
 return <section className="demo-operations" aria-label="Estado da operação"><div><Activity size={17}/><span>Agora na sua operação</span><button aria-label="Atualizar operação" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/></button></div>{error?<p role="status">{error} <button onClick={()=>setRefresh(n=>n+1)}>Tentar novamente</button></p>:!snapshot?<p role="status">Consultando o seu ambiente…</p>:<><Link href="/demo/sdr"><strong>{snapshot.ai?'Disponível':'Indisponível'}</strong><span>Atendimento com IA</span></Link><Link href="/demo/crm"><strong>{snapshot.pipelines}</strong><span>Funis no CRM</span></Link><Link href="/demo/executions"><strong>{snapshot.approvals}</strong><span>Aprovações recentes <ArrowUpRight size={11}/></span></Link><small>Consultado às {snapshot.checked}<br/>Dados do laboratório</small></>}</section>
}
