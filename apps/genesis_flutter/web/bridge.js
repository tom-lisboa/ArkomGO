/* Same-origin transport only. Session remains in memory; never URL or storage. */
(function(global){
'use strict';
class SSEParser {
 constructor(deliver){this.buffer='';this.deliver=deliver;this.event='message';this.id='';this.data=[];}
 feed(chunk){this.buffer+=chunk;let n;while((n=this.buffer.indexOf('\n'))>=0){let line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);if(line.endsWith('\r'))line=line.slice(0,-1);this.line(line);}}
 line(line){if(!line){if(this.data.length)this.deliver({event:this.event,id:this.id,data:this.data.join('\n')});this.event='message';this.data=[];return;}if(line.startsWith(':'))return;const at=line.indexOf(':');const field=at<0?line:line.slice(0,at);let value=at<0?'':line.slice(at+1);if(value.startsWith(' '))value=value.slice(1);if(field==='event')this.event=value;if(field==='id')this.id=value;if(field==='data')this.data.push(value);}
}
if(typeof module!=='undefined')module.exports={SSEParser};
if(!global.document)return;
let session=null,callback=null,controller=null,selection=0,retry=null,handshake=null,selected='',cursor=0,disposed=false;
let runtimeTimer=null,runtimeStatus='stopped';
const base='/api/demo/backend/v1/sdr/genesis-demo/construction';
const emit=(type,data={})=>callback?.(JSON.stringify({type,...data}));
const errors={step_checkpoint_changed:'Esta etapa recebeu novos eventos. Atualize o projeto antes de continuar.',step_not_available:'Esta etapa não está disponível para iniciar.',construction_unavailable:'O serviço está encerrando. Tente novamente em instantes.',runtime_entrypoint_missing:'Continue o projeto para adaptar o backend ao contrato NewHandler.',runtime_contract_invalid:'Conclua a construção com um contrato válido antes de iniciar.',runtime_capabilities_unavailable:'Esta aplicação depende de integrações que ainda não estão disponíveis na prévia.',runtime_busy:'Já existe uma prévia em execução para esta empresa. Encerre-a antes de iniciar outra.',runtime_not_running:'Inicie o backend da prévia.',runtime_request_failed:'O backend não respondeu. Reinicie a prévia.',unauthorized:'Sua sessão terminou. Entre novamente.',construction_busy:'Outro projeto está em construção. Aguarde ou interrompa o projeto ativo.',construction_limit:'O limite de projetos deste laboratório foi atingido.',forbidden:'Seu perfil permite apenas acompanhar.',isolated_runner_unavailable:'O executor de testes precisa estar disponível para construir.',invalid_goal:'Descreva sua ideia com pelo menos 15 caracteres.'};
async function request(url,body,signal){if(!session)throw Error('Aguardando sua sessão Arkom.');const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+session.access_token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',signal:signal||AbortSignal.timeout(20000)});if(!r.ok){const data=await r.json().catch(()=>({}));const error=Error(errors[data.error]||'Não foi possível concluir a operação ('+r.status+').');error.status=r.status;throw error;}return r;}
function stop(){clearTimeout(runtimeTimer);runtimeStatus='stopped';emit('runtime',{status:'stopped'});selection++;controller?.abort();clearTimeout(retry);controller=null;}
async function stream(id,generation){
 controller=new AbortController();emit('connection',{status:'connecting'});let ended=false;
 try{const r=await request(base+'/'+encodeURIComponent(id)+'/events?after='+cursor,undefined,controller.signal);if(generation!==selection)return;
 if(!r.headers.get('content-type')?.includes('text/event-stream'))throw Error('O servidor não abriu o fluxo de eventos.');
 emit('connection',{status:'live'});
 const decoder=new TextDecoder();const parser=new SSEParser(frame=>{if(generation!==selection)return;if(frame.event==='session.expired'){ended=true;emit('error',{message:errors.unauthorized});emit('connection',{status:'expired'});return;}if(frame.event==='end'){ended=true;emit('connection',{status:'complete'});return;}if(frame.event==='snapshot'||frame.event==='update'){const data=JSON.parse(frame.data);cursor=data.build.sequence;emit(frame.event,data);}});
 const reader=r.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;parser.feed(decoder.decode(value,{stream:true}));}parser.feed(decoder.decode());
 }catch(e){if(generation!==selection||disposed)return;if([401,403,404].includes(e.status)){ended=true;emit('error',{message:e.message});emit('connection',{status:e.status===401?'expired':'unavailable'});}else{emit('connection',{status:'reconnecting'});}}
 if(!ended&&generation===selection&&!disposed){emit('connection',{status:'reconnecting'});retry=setTimeout(()=>stream(id,generation),1800);}
}
async function pollRuntime(id,generation){
 clearTimeout(runtimeTimer);
 try{const state=await(await request(base+'/'+encodeURIComponent(id)+'/runtime')).json();if(generation!==selection||id!==selected||disposed)return;runtimeStatus=state.status;emit('runtime',state);if(['starting','running'].includes(state.status))runtimeTimer=setTimeout(()=>pollRuntime(id,generation),1500);}
 catch(e){if(generation===selection){runtimeStatus='stopped';emit('runtime',{status:'stopped'});emit('error',{message:e.message});}}
}
function receive(event){if(event.origin!==global.location.origin||event.source!==global.parent||event.data?.type!=='arkom.genesis.session')return;const next=event.data.session;if(!next?.access_token||!next?.identity)return;if(session?.access_token===next.access_token)return;stop();selected='';cursor=0;session=next;clearTimeout(handshake);emit('session',{identity:session.identity});}
global.addEventListener('message',receive);
global.genesisBridge={
 createPreview(files){const id=selected,identity=session;return global.genesisPreview.createPreview(JSON.parse(files),async data=>{
  if(!id||id!==selected||identity!==session||disposed||runtimeStatus!=='running')throw Error('Inicie o backend desta prévia antes de usar esta função.');
  const result=await(await request(base+'/'+encodeURIComponent(id)+'/runtime/request',data)).json();
  if(id!==selected||identity!==session||disposed)throw Error('A prévia foi encerrada.');return result;
 });},
 connect(cb){callback=cb;disposed=false;const ready=()=>{if(disposed)return;global.parent.postMessage({type:'arkom.genesis.ready'},global.location.origin);if(!session)handshake=setTimeout(ready,1000);};ready();if(session)emit('session',{identity:session.identity});},
 disconnect(){disposed=true;stop();clearTimeout(handshake);session=null;callback=null;},
 async invoke(action,payload){const data=JSON.parse(payload||'{}');
 if(action==='list')return JSON.stringify(await (await request(base)).json());
 if(action==='select'){stop();selected=data.id;cursor=0;if(selected){void stream(selected,selection);void pollRuntime(selected,selection);}return '{}';}
 if(action==='start')return JSON.stringify(await (await request(base,{goal:data.goal,parent_id:data.parent_id||''})).json());
 if(action==='runtime_start'||action==='runtime_stop'){if(data.id!==selected)throw Error('Selecione novamente o projeto.');const result=await(await request(base+'/'+encodeURIComponent(data.id)+'/runtime/'+(action==='runtime_start'?'start':'stop'),{})).json();void pollRuntime(selected,selection);return JSON.stringify(result);}
 if(action==='advance_step'){if(data.id!==selected)throw Error('Selecione novamente o projeto.');return JSON.stringify(await(await request(base+'/'+encodeURIComponent(data.id)+'/advance',{step_id:data.step_id,sequence:data.sequence})).json());}
 if(action==='cancel')return JSON.stringify(await (await request(base+'/'+encodeURIComponent(data.id)+'/cancel',{})).json());
 if(action==='export'){const blob=await (await request(base+'/'+encodeURIComponent(data.id)+'/export')).blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='genesis-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);return '{}';}
 if(action==='qualification'){global.parent.postMessage({type:'arkom.genesis.qualification'},global.location.origin);return '{}';}
 throw Error('Ação não reconhecida.');}
};
global.addEventListener('pagehide',()=>global.genesisBridge.disconnect());
})(globalThis);
