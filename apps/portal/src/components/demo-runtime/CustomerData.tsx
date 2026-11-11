import React,{useEffect,useRef,useState} from 'react';
import {Database,Download,RefreshCw,ShieldCheck} from 'lucide-react';
import {Button} from './components/Button';
import {ApiError,describe,request,type Session} from './api';
import {customerDownload,customerQuery,type CustomerExport} from './customer-api';

const labels:Record<string,string>={queued:'Aguardando preparação',running:'Reunindo seus dados',ready:'Pronto para baixar',failed:'Não foi possível preparar o arquivo'};
type Overview={customer:{organizationId:string;exports:CustomerExport[];workerUsage:{available:boolean;retentionDays:number;report:{workers:{id:string;starts:number;completed:number;failed:number}[];collected_since:string;limited:boolean}|null}}};

export default function CustomerData({session}:{session:Session}){
 const [overview,setOverview]=useState<Overview|null>(null),[job,setJob]=useState<CustomerExport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null),pendingKey=useRef<string|null>(null);
 useEffect(()=>{const abort=new AbortController();controller.current=abort;
  customerQuery<Overview>(session,'{customer{organizationId exports{id status createdAt capturedAt expiresAt downloadPath errorCode} workerUsage(days:90){available retentionDays report}}}',{},abort.signal).then(data=>{if(!abort.signal.aborted){setOverview(data);setJob(data.customer.exports.find(j=>new Date(j.expiresAt).getTime()>Date.now())??null)}}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof ApiError&&e.status===404?'Esta função ainda não está disponível neste ambiente.':describe(e))});
  return()=>abort.abort();
 },[session]);
 async function download(){
  const signal=controller.current?.signal;if(!signal||signal.aborted)return;
  setBusy(true);setError('');
  try{
   let current=job;
   if(!current||current.status==='failed'||new Date(current.expiresAt).getTime()<=Date.now()){
    pendingKey.current??=crypto.randomUUID();
    current=await request<CustomerExport>('/v1/customer/exports',session,{},pendingKey.current,signal);if(signal.aborted)return;pendingKey.current=null;setJob(current);
   }
   for(let attempt=0;current.status==='queued'||current.status==='running';attempt++){
    if(attempt>=70)throw Error('export_waiting');
    await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('aborted'))};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},3000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()});
    current=await request<CustomerExport>('/v1/customer/exports/'+current.id,session,undefined,undefined,signal);if(signal.aborted)return;setJob(current);
   }
   if(current.status!=='ready')throw Error('export_failed');
   const blob=await customerDownload(session,current.id,signal);if(signal.aborted)return;
   const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='meus-dados-sdr.zip';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(!signal.aborted)setError(e instanceof ApiError?describe(e):e instanceof Error&&e.message==='export_waiting'?'Seu arquivo continua sendo preparado. Aguarde e toque no botão novamente.':'Não foi possível concluir o download. Toque no botão para tentar novamente.')}finally{if(!signal.aborted)setBusy(false)}
 }
 return <main className="core-page"><div className="core-heading"><div><p className="eyebrow">Sua empresa · seus dados</p><h1 className="text-h2">Meus dados</h1><p>Baixe os registros que sua empresa mantém nesta plataforma e acompanhe o uso do atendimento.</p></div><span className="core-badge"><ShieldCheck size={16}/>Acesso do administrador</span></div>
 <section className="core-card"><h2><Database size={20}/>Uma cópia para você</h2><p>O arquivo reúne conhecimento do negócio, conversas e mensagens recebidas pela plataforma, memória, configurações, execuções, auditoria, métricas disponíveis e anexos ainda conservados.</p><p className="core-note">O histórico anterior do celular não é importado. Anexos expiram após sete dias; o relatório do arquivo identifica o que foi incluído e o que já está indisponível. As métricas guardam até 90 dias e podem estar indisponíveis no momento da preparação.</p><p className="core-note">O download fica disponível por 24 horas e pertence somente à sua empresa. Administradores da mesma empresa compartilham os dados.</p>
 <Button disabled={busy||!overview} onClick={()=>void download()}>{busy?<RefreshCw size={16}/>:<Download size={16}/>} {busy?(job?labels[job.status]??'Preparando download…':'Preparando download…'):'Baixar meus dados'}</Button>
 {job&&<p role="status">{labels[job.status]??job.status}{job.capturedAt&&' · Dados reunidos em '+new Date(job.capturedAt).toLocaleString('pt-BR')}</p>}{error&&<p role="alert" className="core-error">{error}</p>}</section>
 <section className="core-card"><h2>Uso dos workers da sua empresa</h2>{overview?.customer.workerUsage.available?<div className="lab-table"><table><thead><tr><th>Worker</th><th>Acionamentos</th><th>Concluídos</th><th>Falhas</th></tr></thead><tbody>{overview.customer.workerUsage.report?.workers.map(w=><tr key={w.id}><td>{w.id}</td><td>{w.starts}</td><td>{w.completed}</td><td>{w.failed}</td></tr>)}</tbody></table></div>:<p>As métricas não estão disponíveis neste momento.</p>}<p className="core-note">Até 90 dias de registros coletados. A coleta acompanha o processamento e pode levar alguns segundos para atualizar.</p></section></main>;
}
