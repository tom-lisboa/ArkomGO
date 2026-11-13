/* Generated applications run in an opaque-origin sandbox, without the Arkom session. */
(function(global){
'use strict';
const policy="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
function previewClient(){
 // Native form submission is disabled in the opaque preview. Deliver only the
 // application's submit event; data still goes through the authenticated bridge.
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button,input');
  if(event.defaultPrevented||event.button!==0||!button?.form||button.disabled||!['submit','image'].includes(button.type))return;
  event.preventDefault();
  const form=button.form;
  if(!form.noValidate&&!button.formNoValidate&&!form.reportValidity())return;
  form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));
 });
 const pending=new Set();
 window.fetch=async function(input,options={}){
  const path=typeof input==='string'?input:'';
  if(!path.startsWith('/api/')||typeof options.body!=='undefined'&&typeof options.body!=='string')throw Error('A prévia aceita somente chamadas JSON às rotas /api/.');
  if(pending.size>=4)throw Error('Aguarde a operação atual.');
  const channel=new MessageChannel();pending.add(channel);
  return new Promise((resolve,reject)=>{
   const finish=()=>{clearTimeout(timer);pending.delete(channel);channel.port1.close();};
   const timer=setTimeout(()=>{finish();reject(Error('A chamada ao backend expirou.'));},150000);
   channel.port1.onmessage=({data})=>{finish();if(data.error){reject(Error(data.error));return;}try{resolve(new Response([204,205,304].includes(data.status)?null:data.body,{status:data.status,headers:{'Content-Type':data.content_type}}));}catch(e){reject(e);}};
   parent.postMessage({type:'arkom.preview.request',request:{method:options.method||'GET',path,body:options.body||''}},'*',[channel.port2]);
  });
 };
}
const previews=new Set();
if(global.document)global.addEventListener('message',async event=>{
 if(event.origin!=='null'||event.data?.type!=='arkom.preview.request'||event.ports?.length!==1)return;
 for(const record of previews){
  const frame=record.ref.deref();if(!frame){previews.delete(record);continue;}
  if(!frame.isConnected||event.source!==frame.contentWindow)continue;
  const port=event.ports[0];
  if(record.pending>=4){port.postMessage({error:'Aguarde a operação atual.'});port.close();return;}
  record.pending++;
  try{const r=event.data.request;if(!r||typeof r.path!=='string'||typeof r.method!=='string'||typeof r.body!=='string'||r.body.length>32768||r.path.length>2048)throw Error('Pedido inválido.');port.postMessage(await record.call(r));}
  catch(e){port.postMessage({error:e.message||'Backend indisponível.'});}
  finally{record.pending--;port.close();}
  return;
 }
});
function compilePreview(files,Parser=global.DOMParser,withRuntime=false,initialRoute=''){
 if(initialRoute && !/^\/(?!\/)[A-Za-z0-9_%/.-]*$/.test(initialRoute))throw Error('Use uma rota local, como /clientes/42.');
 if(!files['frontend/index.html'])throw Error('A interface ainda não foi criada.');
 const doc=new Parser().parseFromString(files['frontend/index.html'],'text/html');
 const resolve=(value)=>{const url=new URL(value,'https://preview.invalid/frontend/index.html');if(url.origin!=='https://preview.invalid')return null;return decodeURIComponent(url.pathname.slice(1));};
 const data=(type,value)=>'data:'+type+';base64,'+btoa(unescape(encodeURIComponent(value)));
 doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed').forEach(el=>el.remove());
 for(const el of doc.querySelectorAll('link[rel="stylesheet"]')){const name=resolve(el.getAttribute('href')||'');if(name&&files[name]!==undefined){const style=doc.createElement('style');style.textContent=files[name];el.replaceWith(style);}else el.remove();}
 for(const el of doc.querySelectorAll('script[src]')){const name=resolve(el.getAttribute('src')||'');if(name&&files[name]!==undefined){el.src=data('text/javascript',files[name]);el.removeAttribute('integrity');el.removeAttribute('crossorigin');}else el.remove();}
 const security=doc.createElement('meta');security.httpEquiv='Content-Security-Policy';security.content=policy;doc.head.prepend(security);
 if(initialRoute){const script=doc.createElement('script');script.textContent='window.location.hash='+JSON.stringify('#'+initialRoute)+';';security.after(script);}
 if(withRuntime){const script=doc.createElement('script');script.textContent='('+previewClient.toString()+')();';security.after(script);}
 const referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';doc.head.prepend(referrer);
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
function createFrame(files,call,initialRoute=''){const iframe=global.document.createElement('iframe');iframe.title='Sua solução — prévia interativa';iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('referrerpolicy','no-referrer');iframe.style.cssText='width:100%;height:100%;border:0;background:#0b0b10;display:block';iframe.srcdoc=compilePreview(files,global.DOMParser,!!call,initialRoute);if(call)previews.add({ref:new WeakRef(iframe),call,pending:0});return iframe;}
function createPreview(files,call){
 const iframe=createFrame(files,call);
 let plan;try{plan=JSON.parse(files['design/navigation.json']||'null');}catch{return iframe;}
 if(!plan?.routes?.length)return iframe;
 const box=global.document.createElement('div');box.style.cssText='height:100%;display:flex;flex-direction:column;background:#fff';
 const form=global.document.createElement('form');form.style.cssText='display:flex;gap:8px;align-items:center;padding:8px;flex-wrap:wrap;color:#25303a;font:13px system-ui';
 const label=global.document.createElement('label');label.textContent='Abrir rota: ';
 const input=global.document.createElement('input');input.value=plan.home;input.setAttribute('aria-label','Rota da prévia');input.placeholder='/clientes/42';input.style.cssText='min-width:100px;max-width:55vw;font:inherit';label.append(input);
 const button=global.document.createElement('button');button.type='submit';button.textContent='Abrir';
 const status=global.document.createElement('span');status.setAttribute('role','status');
 form.append(label,button,status);iframe.style.flex='1';iframe.style.minHeight='0';
 form.addEventListener('submit',event=>{event.preventDefault();try{iframe.srcdoc=compilePreview(files,global.DOMParser,!!call,input.value);status.textContent='';}catch(error){status.textContent=error.message;}});
 box.append(form,iframe);return box;
}
global.genesisPreview={compilePreview,createPreview};
if(typeof module!=='undefined')module.exports={compilePreview,createPreview,policy};
})(globalThis);
