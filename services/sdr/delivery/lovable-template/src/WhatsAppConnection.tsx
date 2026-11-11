import {useCallback,useEffect,useRef,useState} from 'react';
import {CheckCircle2,Clock3,Loader2,MessageSquare,QrCode,RefreshCw,Smartphone,Unplug} from 'lucide-react';
import {Button} from './components/Button';
import {request,describe,ApiError,type Session} from './api';
import WhatsAppMessaging from './WhatsAppMessaging';
import VoiceConsole from './VoiceConsole';

type View={status:string;provisioning:string;qr_data_url?:string;pairing_code?:string;expires_at?:string;operation_id?:string;operation_status?:string;error?:string};
type ConnectionCommand={method:'qr'|'phone'|'disconnect';phone?:string};
const labels:Record<string,string>={preparing:'Preparando sua conexão',disconnected:'Aguardando conexão',waiting_qr_scan:'Aguardando leitura do QR Code',connected:'WhatsApp conectado',connecting:'Conectando seu WhatsApp',pair_code:'Código pronto para usar',expired:'Código expirado',logged_out:'WhatsApp desconectado'};

export default function WhatsAppConnection({session}:{session:Session}){
 const [view,setView]=useState<View|null>(null),[method,setMethod]=useState<'qr'|'phone'>('qr'),[phone,setPhone]=useState('');
 const [busy,setBusy]=useState(false),[loadError,setLoadError]=useState(''),[actionError,setActionError]=useState(''),[confirm,setConfirm]=useState(false),[now,setNow]=useState(Date.now());
 const [pending,setPending]=useState<{body:ConnectionCommand;key:string}|null>(null);
 const alive=useRef(true),refreshing=useRef(false);
 const refresh=useCallback(async()=>{
  if(refreshing.current)return;refreshing.current=true;
  try{const v=await request<View>('/v1/sdr/whatsapp',session);if(alive.current){setView(v);setLoadError('')}}
  catch(e){if(alive.current)setLoadError(describe(e))}finally{refreshing.current=false}
 },[session]);
 useEffect(()=>{alive.current=true;void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh()},3000);return()=>{alive.current=false;clearInterval(timer)}},[refresh]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const connected=view?.status==='connected',canManage=session.identity.role!=='viewer';
 const expires=view?.expires_at?new Date(view.expires_at).getTime():null;
 const expired=view?.status==='expired'||(expires!==null&&expires<=now);
 const operationBusy=['pending','processing','retrying'].includes(view?.operation_status??'');
 const locked=busy||operationBusy||pending!==null;
 const ready=view?.provisioning==='ready';
 async function send(body:ConnectionCommand,key:string=crypto.randomUUID()){
  setBusy(true);setActionError('');setPending(null);
  try{await request('/v1/sdr/whatsapp/connect',session,body,key);if(alive.current){setConfirm(false);await refresh()}}
  catch(e){if(alive.current){setActionError(describe(e));if(!(e instanceof ApiError))setPending({body,key})}}finally{if(alive.current)setBusy(false)}
 }
 return <main className="wa-page">
  <div className="wa-heading"><p className="eyebrow">Canal de atendimento</p><h1 className="text-h2">Seu WhatsApp</h1><p>Conecte seu número, escolha os contatos do teste e acompanhe o atendimento por aqui.</p></div>
  <ol className="wa-steps" aria-label="Como começar"><li><span>1</span>Conectar o número</li><li><span>2</span>Autorizar os contatos</li><li><span>3</span>Conversar e acompanhar</li></ol>
  <div className="wa-status" role="status">{connected?<CheckCircle2 size={20}/>:operationBusy?<Loader2 size={20} className="animate-spin"/>:<Clock3 size={20}/>}<div><strong>{view?(labels[view.status]??'Conferindo conexão'):'Conferindo conexão'}</strong><small>{connected?'Seu número está pareado. A ativação do atendimento é controlada abaixo.':view?.provisioning==='retrying'?'Estamos tentando preparar seu acesso novamente.':'Escolha QR Code ou código pelo número para continuar.'}</small></div><Button variant="ghost" size="sm" onClick={()=>void refresh()} aria-label="Atualizar conexão"><RefreshCw size={16}/></Button></div>
  {(actionError||loadError)&&<div role="alert" className="lab-error">{actionError||loadError}{pending&&<Button disabled={busy} size="sm" onClick={()=>void send(pending.body,pending.key)}>Conferir a mesma solicitação</Button>}</div>}
  {connected?<section className="wa-panel"><div className="wa-section-title"><Smartphone size={22}/><h2>Número conectado</h2></div><p>O WhatsApp está conectado à sua empresa. Para iniciar o atendimento neste piloto, autorize os contatos na próxima etapa.</p>{canManage&&(confirm?<div className="wa-disconnect"><p>Desconectar interrompe o atendimento por este número.</p><div className="wa-options"><Button variant="danger" disabled={busy} onClick={()=>void send({method:'disconnect'})}>Desconectar número</Button><Button variant="ghost" disabled={busy} onClick={()=>setConfirm(false)}>Manter conectado</Button></div></div>:<Button variant="outline" onClick={()=>setConfirm(true)}><Unplug size={16}/>Desconectar número</Button>)}</section>:
  <section className="wa-panel"><div className="wa-section-title"><Smartphone size={22}/><h2>1. Conecte seu número</h2></div><div className="wa-options" role="group" aria-label="Forma de conexão"><Button variant={method==='qr'?'primary':'outline'} disabled={locked} onClick={()=>{setMethod('qr');setActionError('')}} aria-pressed={method==='qr'}><QrCode size={18}/>QR Code</Button><Button variant={method==='phone'?'primary':'outline'} disabled={locked} onClick={()=>{setMethod('phone');setActionError('')}} aria-pressed={method==='phone'}><Smartphone size={18}/>Código pelo número</Button></div>
   {method==='qr'?<><p>No celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo. Aponte a câmera para o QR Code.</p>{view?.qr_data_url&&!expired?<div className="wa-qr"><img src={view.qr_data_url} alt="QR Code para conectar seu WhatsApp"/><span>{expires?`Válido por mais ${Math.max(0,Math.ceil((expires-now)/1000))} segundos`:'Aguardando confirmação no celular'}</span></div>:<div className="wa-pair-placeholder"><QrCode size={36} aria-hidden="true"/><p>{expired?'O QR Code expirou. Gere outro para continuar.':'Seu QR Code aparecerá aqui após a solicitação.'}</p></div>}<Button disabled={!canManage||locked||!ready} onClick={()=>void send({method:'qr'})}>{busy||operationBusy?'Preparando QR Code…':view?.qr_data_url||expired?'Gerar novo QR Code':'Gerar QR Code'}</Button></>:
   <><p>Informe seu número com DDI e DDD. O código aparece nesta tela; digite-o no WhatsApp em Dispositivos conectados → Conectar com número de telefone.</p><label htmlFor="wa-phone">Número do WhatsApp<input id="wa-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+55 (11) 99999-9999" value={phone} maxLength={24} onChange={e=>setPhone(e.target.value)} disabled={!canManage||locked}/></label><Button disabled={!canManage||locked||!ready||!phone.trim()} onClick={()=>void send({method:'phone',phone})}>{busy||operationBusy?'Preparando código…':'Gerar código de conexão'}</Button>{view?.pairing_code&&!expired&&<div className="wa-pair" role="status"><strong>{view.pairing_code}</strong><span>Digite este código no WhatsApp do celular.</span>{expires&&<span>Válido por mais {Math.max(0,Math.ceil((expires-now)/1000))} segundos</span>}</div>}{expired&&<p>O código expirou. Solicite outro para continuar.</p>}<p className="lab-hint">O código é exibido aqui. Ele não é enviado por SMS.</p></>}
   {view?.error&&<p role="alert">A conexão não foi concluída. Atualize o estado e tente novamente.</p>}{!ready&&<p className="lab-hint">Aguarde enquanto preparamos a conexão da sua empresa.</p>}{!canManage&&<p className="lab-hint">Seu perfil permite acompanhar o estado. Administradores e operadores podem conectar o número.</p>}
  </section>}
  <WhatsAppMessaging session={session} connected={connected}/>
  {import.meta.env.VITE_SDR_REMIX !== 'true' && <VoiceConsole key={session.identity.organization_id} session={session}/>}
  <section className="wa-panel"><div className="wa-section-title"><MessageSquare size={22}/><h2>3. Teste o atendimento</h2></div><p>De outro número autorizado, envie uma mensagem para o WhatsApp conectado. Áudio, imagem e PDF dependem da permissão de mídias na etapa anterior. Abra Conversas para acompanhar a resposta ou assumir o atendimento.</p><p className="lab-hint">Neste piloto, use um número de teste que você controla. A confirmação no celular é necessária para concluir a conexão.</p></section>
 </main>
}
