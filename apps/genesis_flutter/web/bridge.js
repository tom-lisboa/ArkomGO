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
let platformFile=null;
const clipsMedia=new Set();
const clipsPlayers=new Map();
function pauseClipsMedia(url){
 const player=clipsPlayers.get(url);
 if(!player)return;
 player.pause();player.removeAttribute('src');player.load();clipsPlayers.delete(url);
}
function releaseClipsMedia(url){if(clipsMedia.delete(url)){pauseClipsMedia(url);URL.revokeObjectURL(url);}}
function clearClipsMedia(){for(const url of clipsMedia)releaseClipsMedia(url);}
let runtimeTimer=null,runtimeStatus='stopped',selectedBuild=null,runtimePending=null,runtimePaused=false,autoAttempted=false;
let lifecycle=Promise.resolve(),requests=Promise.resolve(),ownedRuntime=null;
const current=(id,generation,identity)=>!disposed&&id===selected&&generation===selection&&identity===session;
const ready=()=>selectedBuild?.status==='ready'&&selectedBuild.contract_status==='validated'&&selectedBuild.runtime_compatible&&session?.identity.role!=='viewer';
const runtimeState=state=>{runtimeStatus=state.status;emit('runtime',state);};
const enqueueLifecycle=work=>{const result=lifecycle.then(work);lifecycle=result.catch(()=>{});return result;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const base='/api/demo/backend/v1/sdr/genesis-demo/construction';
const clipsGIFBase='/api/demo/backend/v1/sdr/genesis-demo/ecosystem/clips/gifs';
const emit=(type,data={})=>callback?.(JSON.stringify({type,...data}));
const errors={revision_reuse_unavailable:'Esta revisão não pode reaproveitar as etapas com segurança. Selecione revisão completa.',invalid_revision_scope:'Escolha um escopo de revisão válido.',revision_parent_required:'Selecione a aplicação que deseja revisar.',frontend_compiler_unavailable:'O compilador Svelte precisa ser instalado pelo administrador. Execute scripts/build-demo.py e reinicie a demo.',frontend_compilation_failed:'A compilação Svelte falhou. Confira os traces e retome a etapa.',preview_records_limit:'A coleção atingiu o limite de 20 registros desta etapa.',preview_records_invalid:'O registro enviado pela aplicação é inválido ou ultrapassa o limite.',preview_data_unavailable:'Não foi possível salvar o dado. Reinicie a prévia e tente novamente.',preview_data_conflict:'O dado mudou durante a operação. Reinicie a prévia antes de tentar novamente.',preview_data_invalid:'O dado enviado pela aplicação é inválido ou ultrapassa o limite.',runtime_session_changed:'A prévia foi encerrada ou reiniciada. Tente novamente na sessão atual.',step_checkpoint_changed:'Esta etapa recebeu novos eventos. Atualize o projeto antes de continuar.',step_not_available:'Esta etapa não está disponível para iniciar.',construction_unavailable:'O serviço está encerrando. Tente novamente em instantes.',runtime_entrypoint_missing:'Continue o projeto para adaptar o backend ao contrato NewHandler.',runtime_contract_invalid:'Conclua a construção com um contrato válido antes de iniciar.',runtime_capabilities_unavailable:'Esta aplicação depende de integrações que ainda não estão disponíveis na prévia.',runtime_busy:'Já existe uma prévia em execução para esta empresa. Encerre-a antes de iniciar outra.',runtime_not_running:'Inicie o backend da prévia.',runtime_request_failed:'O backend não respondeu. Reinicie a prévia.',unauthorized:'Sua sessão terminou. Entre novamente.',construction_busy:'Outro projeto está em construção. Aguarde ou interrompa o projeto ativo.',construction_limit:'O limite de projetos deste laboratório foi atingido.',forbidden:'Seu perfil permite apenas acompanhar.',isolated_runner_unavailable:'O executor de testes precisa estar disponível para construir.',invalid_goal:'Descreva sua ideia com pelo menos 15 caracteres.'};
async function request(url,body,signal,key){if(!session)throw Error('Aguardando sua sessão Arkom.');const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+session.access_token,...(key?{'Idempotency-Key':key}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',signal:signal||AbortSignal.timeout(20000)});if(!r.ok){const data=await r.json().catch(()=>({}));const error=Error(errors[data.error]||'Não foi possível concluir a operação ('+r.status+').');error.status=r.status;error.code=data.error;throw error;}return r;}
function stop(){clearTimeout(runtimeTimer);selection++;controller?.abort();clearTimeout(retry);controller=null;selectedBuild=null;runtimePending=null;runtimePaused=false;autoAttempted=false;requests=Promise.resolve();runtimeState({status:'stopped'});}
function ensureRuntime(id,generation,identity){
 if(!current(id,generation,identity))return Promise.reject(Error('A prévia foi encerrada.'));
 if(runtimePaused)return Promise.reject(Error('A solução está pausada. Use Conectar solução para continuar.'));
 if(!ready())return Promise.reject(Error('Conclua as etapas de construção e validação para usar os dados da solução.'));
 if(runtimePending)return runtimePending;
 if(runtimeStatus==='running')return Promise.resolve();
 clearTimeout(runtimeTimer);
 runtimeState({status:'starting'});
 const work=enqueueLifecycle(async()=>{
  const check=()=>{if(!current(id,generation,identity)||runtimePaused)throw Error('A prévia foi encerrada.');};
  check();
  // Release only a runtime selected by this studio session, never another user's.
  if(ownedRuntime&&ownedRuntime.id!==id&&ownedRuntime.identity===identity){
   await request(base+'/'+encodeURIComponent(ownedRuntime.id)+'/runtime/stop',{});check();ownedRuntime=null;
  }
  let state=await(await request(base+'/'+encodeURIComponent(id)+'/runtime')).json();check();
  ownedRuntime={id,identity};
  if(!['running','starting'].includes(state.status))state=await(await request(base+'/'+encodeURIComponent(id)+'/runtime/start',{})).json();
  check();runtimeState(state);
  const deadline=Date.now()+110000;
  while(state.status==='starting'&&Date.now()<deadline){
   await delay(400);check();
   state=await(await request(base+'/'+encodeURIComponent(id)+'/runtime')).json();check();runtimeState(state);
  }
  if(state.status!=='running')throw Error(state.message||'Não foi possível preparar a solução. Tente conectar novamente.');
  runtimeTimer=setTimeout(()=>pollRuntime(id,generation),1500);
 });
 const pending=work.catch(error=>{if(current(id,generation,identity)&&!runtimePaused)runtimeState({status:'failed',message:error.message});throw error;}).finally(()=>{if(runtimePending===pending)runtimePending=null;});
 runtimePending=pending;return pending;
}
function buildReceived(build){
 selectedBuild=build;
 if(ready()&&!runtimePaused&&!autoAttempted){autoAttempted=true;void ensureRuntime(selected,selection,session).catch(()=>{});}
}

async function stream(id,generation){
 controller=new AbortController();emit('connection',{status:'connecting'});let ended=false;
 try{const r=await request(base+'/'+encodeURIComponent(id)+'/events?after='+cursor,undefined,controller.signal);if(generation!==selection)return;
 if(!r.headers.get('content-type')?.includes('text/event-stream'))throw Error('O servidor não abriu o fluxo de eventos.');
 emit('connection',{status:'live'});
 const decoder=new TextDecoder();const parser=new SSEParser(frame=>{if(generation!==selection)return;if(frame.event==='session.expired'){ended=true;emit('error',{message:errors.unauthorized});emit('connection',{status:'expired'});return;}if(frame.event==='end'){ended=true;emit('connection',{status:'complete'});return;}if(frame.event==='snapshot'||frame.event==='update'){const data=JSON.parse(frame.data);cursor=data.build.sequence;buildReceived(data.build);emit(frame.event,data);}});
 const reader=r.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;parser.feed(decoder.decode(value,{stream:true}));}parser.feed(decoder.decode());
 }catch(e){if(generation!==selection||disposed)return;if([401,403,404].includes(e.status)){ended=true;emit('error',{message:e.message});emit('connection',{status:e.status===401?'expired':'unavailable'});}else{emit('connection',{status:'reconnecting'});}}
 if(!ended&&generation===selection&&!disposed){emit('connection',{status:'reconnecting'});retry=setTimeout(()=>stream(id,generation),1800);}
}
async function pollRuntime(id,generation){
 clearTimeout(runtimeTimer);
 try{const state=await(await request(base+'/'+encodeURIComponent(id)+'/runtime')).json();if(generation!==selection||id!==selected||disposed)return;if(runtimePending)return;runtimeState(state);if(['starting','running'].includes(state.status))runtimeTimer=setTimeout(()=>pollRuntime(id,generation),1500);}
 catch(e){if(generation===selection){runtimeStatus='stopped';emit('runtime',{status:'stopped'});emit('error',{message:e.message});}}
}
function receive(event){if(event.origin!==global.location.origin||event.source!==global.parent||event.data?.type!=='arkom.genesis.session')return;const next=event.data.session;if(!next?.access_token||!next?.identity)return;if(session?.access_token===next.access_token)return;stop();platformFile=null;clearClipsMedia();ownedRuntime=null;selected='';cursor=0;session=next;clearTimeout(handshake);emit('session',{identity:session.identity});}
global.addEventListener('message',receive);
global.genesisBridge={
 createClipsPlayer(url){
  const video=document.createElement('video');
  video.controls=true;video.playsInline=true;video.preload='metadata';
  video.setAttribute('aria-label','Reprodutor de vídeo');
  Object.assign(video.style,{width:'100%',height:'100%',objectFit:'contain',background:'#171913'});
  if(clipsMedia.has(url)){pauseClipsMedia(url);video.src=url;clipsPlayers.set(url,video);}
  return video;
 },
 createPreview(files){const id=selected,identity=session,generation=selection;return global.genesisPreview.createPreview(JSON.parse(files),data=>{
  const run=async()=>{
   if(!current(id,generation,identity))throw Error('A prévia foi encerrada.');
   await ensureRuntime(id,generation,identity);
   if(!current(id,generation,identity)||runtimePaused)throw Error('A prévia foi encerrada.');
   let result;
   try{result=await(await request(base+'/'+encodeURIComponent(id)+'/runtime/request',data)).json();}
   catch(error){
    // This error is returned before execution; other errors must never replay a write.
    if(error.code!=='runtime_not_running'||!current(id,generation,identity))throw error;
    runtimeState({status:'stopped'});await ensureRuntime(id,generation,identity);
    if(!current(id,generation,identity)||runtimePaused)throw Error('A prévia foi encerrada.');
    result=await(await request(base+'/'+encodeURIComponent(id)+'/runtime/request',data)).json();
   }
   if(!current(id,generation,identity))throw Error('A prévia foi encerrada.');return result;
  };
  const result=requests.then(run);requests=result.catch(()=>{});return result;
 });},
 connect(cb){callback=cb;disposed=false;const ready=()=>{if(disposed)return;global.parent.postMessage({type:'arkom.genesis.ready'},global.location.origin);if(!session)handshake=setTimeout(ready,1000);};ready();if(session)emit('session',{identity:session.identity});},
 disconnect(){disposed=true;platformFile=null;clearClipsMedia();stop();clearTimeout(handshake);session=null;callback=null;},
 async invoke(action,payload){const data=JSON.parse(payload||'{}');
 if(action==='platform'){
  if(typeof data.path!=='string'||!['/v1/sdr/','/v1/core/','/v1/platform/','/__test/ui/'].some(prefix=>data.path.startsWith(prefix))||data.path.includes('..')||data.path.includes('://'))throw Error('Rota não permitida.');
  const identity=session;
  const response=await request('/api/demo/backend'+data.path,data.body,undefined,data.body===undefined?undefined:crypto.randomUUID());
  const result=response.status===204?{}:await response.json();
  if(identity!==session||disposed)throw Error('Sua sessão mudou. Atualize a tela.');
  return JSON.stringify(result);
 }
 if(action==='navigate'){if(!['home','map','systems','sdr','crm','clips','genesis','business'].includes(data.view)&&!/^systems\/[a-z][a-z0-9_]{0,40}$/.test(data.view))throw Error('Destino indisponível.');global.parent.postMessage({type:'arkom.platform.navigate',view:data.view},global.location.origin);return '{}';}
 if(action==='clips_pick'){
  const identity=session;
  if(!identity||identity.identity.role==='viewer')throw Error('Seu perfil permite apenas acompanhar.');
  const file=await new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.mp4,.m4v,video/mp4,video/x-m4v';input.onchange=()=>resolve(input.files?.[0]||null);input.oncancel=()=>resolve(null);input.click();});
  if(!file)return '{}';
  if(identity!==session||disposed)throw Error('Sua sessão mudou.');
  if(!/\.(mp4|m4v)$/i.test(file.name)||file.size>7*1024*1024)throw Error('Escolha um vídeo MP4 ou M4V de até 7 MB.');
  const url=URL.createObjectURL(file);
  const video=document.createElement('video');
  const duration=await new Promise(resolve=>{
   const finish=value=>{clearTimeout(timer);video.onloadedmetadata=video.onerror=null;resolve(value);};
   const timer=setTimeout(()=>finish(0),7000);
   video.onloadedmetadata=()=>finish(video.duration);video.onerror=()=>finish(0);
   video.preload='metadata';video.src=url;
  });
  video.removeAttribute('src');video.load();
  if(identity!==session||disposed||!Number.isFinite(duration)||duration<1){
   URL.revokeObjectURL(url);throw Error('Não foi possível ler o vídeo. Escolha um arquivo válido com pelo menos um segundo.');
  }
  platformFile=file;clipsMedia.add(url);
  return JSON.stringify({name:file.name,url,duration});
 }
 if(action==='clips_pause'){pauseClipsMedia(data.url);return '{}';}
 if(action==='clips_release'){releaseClipsMedia(data.url);return '{}';}
 if(action==='clips_gif_submit'||action==='clips_gif_media'){
  const identity=session;
  if(action==='clips_gif_submit'){
   try{
    const result=await(await request(clipsGIFBase,{prompt:data.prompt,gift:data.gift},undefined,data.key)).json();
    if(identity!==session||disposed)throw Error('Sua sessão mudou.');
    return JSON.stringify(result);
   }catch(error){
    if(identity!==session||disposed)throw Error('Sua sessão mudou.');
    return JSON.stringify({uncertain:!error.status||error.status>=500,code:error.code||''});
   }
  }
  if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))throw Error('GIF inválido.');
  const response=await request(clipsGIFBase+'/'+data.id+'/image');
  const blob=await response.blob();
  if(identity!==session||disposed)throw Error('Sua sessão mudou.');
  if(blob.type!=='image/gif')throw Error('O arquivo ainda não está disponível.');
  const url=URL.createObjectURL(blob);
  clipsMedia.add(url);
  if(!data.download)return JSON.stringify({url});
  const link=document.createElement('a');
  link.href=url;link.download='arkom-'+data.id.slice(0,8)+'.gif';link.click();
  setTimeout(()=>releaseClipsMedia(url),5000);
  return '{}';
 }
 if(action==='clips_upload'){
  if(!session||!platformFile)throw Error('Selecione um vídeo primeiro.');
  const identity=session,file=platformFile;
  const form=new FormData();form.append('video',file);form.append('title',data.title);form.append('start',String(data.start));form.append('duration',String(data.duration));
  let response;
  try{
   response=await fetch('/api/demo/backend/v1/sdr/genesis-demo/ecosystem/clips/jobs',{method:'POST',headers:{Authorization:'Bearer '+identity.access_token,'Idempotency-Key':data.key},body:form,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000)});
  }catch{return JSON.stringify({uncertain:true,message:'Não conseguimos confirmar o envio. Confira o mesmo pedido para evitar uma cópia.'});}
  if(identity!==session||disposed)throw Error('Sua sessão mudou.');
  if(!response.ok){
   const error=await response.json().catch(()=>({}));
   return JSON.stringify({uncertain:response.status>=500,message:({envie_um_mp4_valido:'Escolha um vídeo MP4 válido.',intervalo_invalido:'Confira o intervalo do corte.',chave_ja_usada:'O pedido original tem outros dados.',video_limit_7_mib:'Escolha um vídeo de até 7 MB.'})[error.error]||'O CLIPS não conseguiu receber o vídeo. Tente novamente.'});
  }
  const result=await response.json().catch(()=>null);
  if(!result?.id)return JSON.stringify({uncertain:true,message:'Confira o mesmo pedido para confirmar o envio.'});
  if(platformFile===file)platformFile=null;
  return JSON.stringify(result);
 }
 if(action==='clips_download'||action==='clips_preview'){
  if(typeof data.id!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(data.id))throw Error('Corte inválido.');
  const identity=session;
  const blob=await(await request('/api/demo/backend/v1/sdr/genesis-demo/ecosystem/clips/jobs/'+data.id+'/video')).blob();
  if(identity!==session||disposed)throw Error('Sua sessão mudou.');
  const url=URL.createObjectURL(blob);
  if(action==='clips_preview'){clipsMedia.add(url);return JSON.stringify({url});}
  const link=document.createElement('a');link.href=url;link.download=(String(data.title||'arkom-clips').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80)||'arkom-clips')+'.mp4';link.click();setTimeout(()=>releaseClipsMedia(url),5000);clipsMedia.add(url);return '{}';
 }
 if(action==='list')return JSON.stringify(await (await request(base)).json());
 if(action==='select'){stop();selected=data.id;cursor=0;if(selected){void stream(selected,selection);void pollRuntime(selected,selection);}return '{}';}
 if(action==='start')return JSON.stringify(await (await request(base,{goal:data.goal,parent_id:data.parent_id||'',revision_scope:data.revision_scope||''})).json());
 if(action==='runtime_start'||action==='runtime_stop'){
  if(data.id!==selected)throw Error('Selecione novamente o projeto.');
  const id=selected,generation=selection,identity=session;
  if(action==='runtime_start'){runtimePaused=false;await ensureRuntime(id,generation,identity);return JSON.stringify({status:'running'});}
  runtimePaused=true;clearTimeout(runtimeTimer);runtimeState({status:'stopped'});
  return JSON.stringify(await enqueueLifecycle(async()=>{
   if(!current(id,generation,identity))return {status:'stopped'};
   const result=await(await request(base+'/'+encodeURIComponent(id)+'/runtime/stop',{})).json();
   if(current(id,generation,identity))runtimeState(result);return result;
  }));
 }
 if(action==='advance_step'){if(data.id!==selected)throw Error('Selecione novamente o projeto.');return JSON.stringify(await(await request(base+'/'+encodeURIComponent(data.id)+'/advance',{step_id:data.step_id,sequence:data.sequence})).json());}
 if(action==='cancel')return JSON.stringify(await (await request(base+'/'+encodeURIComponent(data.id)+'/cancel',{})).json());
 if(action==='export'){const blob=await (await request(base+'/'+encodeURIComponent(data.id)+'/export')).blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='genesis-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);return '{}';}
 if(action==='qualification'){global.parent.postMessage({type:'arkom.genesis.qualification'},global.location.origin);return '{}';}
 throw Error('Ação não reconhecida.');}
};
global.addEventListener('pagehide',()=>global.genesisBridge.disconnect());
})(globalThis);
