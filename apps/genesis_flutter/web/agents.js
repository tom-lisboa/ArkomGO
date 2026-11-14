/* Agent surfaces are the only non-Flutter UI. Sessions never enter URLs/storage. */
(function(global){
'use strict';
global.createArkomAgents=function({getSession,request,emit,navigate}){
 const frames=new Map();
 let active=null,financeTitle='',returnToMaia=false;
 const configs={
  sdr:{origin:location.origin,url:'/agents/bia/',name:'BIA SDR'},
  agenda:{origin:location.origin,url:'/agents/bia/?surface=agenda',name:'Lia · Agenda'},
  multipropriedades:{origin:'http://127.0.0.1:8180',url:'http://127.0.0.1:8180/__arkom/entrar',name:'Maia'},
  financeai:{origin:'http://127.0.0.1:8194',url:'http://127.0.0.1:8194',name:'FinanceAI'},
 };
 function status(entry,value,message=''){
  entry.status=value;entry.message=message;
  entry.frame.style.visibility=value==='open'?'visible':'hidden';
  emit('agent',{id:entry.id,status:value,message});
 }
 function remove(id){
  const entry=frames.get(id);if(!entry)return;
  clearTimeout(entry.timeout);entry.abort.abort();entry.frame.remove();frames.delete(id);
 }
 function reset(){for(const id of frames.keys())remove(id);active=null;financeTitle='';returnToMaia=false;}
 function open(id,lease){
  const config=configs[id];if(!config||!getSession())throw Error('Entre na Arkom para abrir seu agente.');
  if(active){const old=frames.get(active.id);if(old)old.frame.style.display='none';}
  let entry=frames.get(id);
  if(!entry){
   const frame=document.createElement('iframe');frame.title=config.name;
   frame.setAttribute('sandbox','allow-same-origin allow-scripts allow-forms allow-downloads'+(id==='multipropriedades'?' allow-popups allow-popups-to-escape-sandbox':''));
   frame.referrerPolicy='no-referrer';frame.dataset.arkomAgent=id;
   Object.assign(frame.style,{position:'fixed',border:'0',borderRadius:'14px',zIndex:'2',visibility:'hidden',display:'none',background:'#0b0d11'});
   entry={id,frame,identity:getSession(),abort:new AbortController(),nonce:null,status:'loading',message:''};
   frames.set(id,entry);
   entry.timeout=setTimeout(()=>status(entry,'unavailable','Não foi possível abrir '+config.name+'. Tente novamente.'),25000);
   document.body.appendChild(frame);frame.src=config.url;
  }
  active={id,lease};entry.frame.style.display='block';status(entry,entry.status,entry.message);
 }
 function backToMaia(){
  returnToMaia=false;financeTitle='';
  navigate('multipropriedades');
  frames.get('multipropriedades')?.frame.contentWindow?.postMessage({type:'arkom.multi.finance-return'},configs.multipropriedades.origin);
 }
 async function receive(event){
  const entry=Array.from(frames.values()).find(e=>event.source===e.frame.contentWindow&&event.origin===configs[e.id].origin);
  if(!entry||entry.identity!==getSession()||entry.abort.signal.aborted)return;
  const data=event.data,child=entry.frame.contentWindow,config=configs[entry.id];
  if(!data||typeof data!=='object')return;
  try{
   if(['sdr','agenda'].includes(entry.id)&&data.type==='arkom.bia.ready'&&typeof data.requestId==='string'&&!entry.nonce){
    entry.nonce=data.requestId;
    const tab=entry.id==='agenda'?'calendar':new URL(location.href).searchParams.get('tab');
    child.postMessage({type:'arkom.bia.session',requestId:entry.nonce,session:entry.identity,tab,surface:entry.id},config.origin);
    // BIA confirms acceptance of this exact session.
   }else if(['sdr','agenda'].includes(entry.id)&&data.type==='arkom.bia.opened'&&data.requestId===entry.nonce){
    clearTimeout(entry.timeout);status(entry,'open');
   }else if(entry.id==='multipropriedades'){
    if(data.type==='arkom.multi.ready'&&typeof data.requestId==='string'&&!entry.nonce){
     entry.nonce=data.requestId;
     const result=await(await request('/api/demo/backend/v1/sdr/genesis-demo/ecosystem/multipropriedades/session',{},entry.abort.signal)).json();
     if(entry.identity!==getSession()||entry.abort.signal.aborted)return;
     child.postMessage({type:'arkom.multi.session',requestId:entry.nonce,session:result},config.origin);
    }else if(entry.nonce&&data.requestId===entry.nonce){
     if(data.type==='arkom.multi.opened'){clearTimeout(entry.timeout);status(entry,'open');}
     if(data.type==='arkom.multi.failed')throw Error('Não foi possível abrir a Maia.');
    }else if(entry.status==='open'&&active?.id===entry.id&&data.type==='arkom.multi.finance'&&typeof data.titleId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(data.titleId)){
     financeTitle=data.titleId;returnToMaia=true;remove('financeai');navigate('financeai',{returnTo:'multipropriedades'});
    }
   }else if(entry.id==='financeai'){
    if(data.type==='arkom.finance.ready'&&typeof data.state==='string'&&typeof data.challenge==='string'&&!entry.nonce){
     entry.nonce=data.state;
     const result=await(await request('/api/demo/backend/v1/sdr/genesis-demo/ecosystem/financeai/session',{state:data.state,challenge:data.challenge},entry.abort.signal)).json();
     if(entry.identity!==getSession()||entry.abort.signal.aborted||result.state!==entry.nonce)return;
     child.postMessage({...result,type:'arkom.finance.handoff',titleId:financeTitle||undefined},config.origin);
    }else if(entry.nonce&&data.state===entry.nonce){
     if(data.type==='arkom.finance.opened'){clearTimeout(entry.timeout);status(entry,'open');}
     if(data.type==='arkom.finance.failed')throw Error('Não foi possível abrir o FinanceAI.');
     if(data.type==='arkom.finance.exited'){remove('financeai');if(returnToMaia)backToMaia();else navigate('team');}
    }
   }
  }catch(error){
   if(entry.identity!==getSession()||entry.abort.signal.aborted)return;
   clearTimeout(entry.timeout);entry.abort.abort();
   status(entry,'unavailable',error.status===403?'Este agente não foi liberado para sua conta.':(error.message||'Não foi possível abrir seu agente.'));
  }
 }
 global.addEventListener('message',receive);
 return {
  reset,
  prepareNavigation(view,extra){
   if(view==='financeai'&&!extra.returnTo&&returnToMaia){remove('financeai');financeTitle='';returnToMaia=false;}
  },
  hide(){if(active){const e=frames.get(active.id);if(e)e.frame.style.display="none";}active=null;},
  invoke(action,data){
   if(action==='agent_open')open(data.id,data.lease);
   else if(action==='agent_close'){if(active?.id===data.id&&active.lease===data.lease){const e=frames.get(data.id);if(e)e.frame.style.display='none';active=null;}}
   else if(action==='agent_bounds'){
    if(active?.id===data.id&&active.lease===data.lease){
     const values=[data.left,data.top,data.width,data.height];
     if(values.every(Number.isFinite)&&data.width>0&&data.height>0){
      const style=frames.get(data.id)?.frame.style;
      if(style)Object.assign(style,{left:data.left+'px',top:data.top+'px',width:data.width+'px',height:data.height+'px'});
     }
    }
   }else if(action==='agent_retry'){remove(data.id);open(data.id,data.lease);}
   else if(action==='agent_return')backToMaia();
   else throw Error('Ação de agente inválida.');
   return '{}';
  }
 };
};
})(globalThis);
