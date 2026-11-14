/* Trusted editing controls live outside the generated, opaque-origin iframe. */
(function(global){
'use strict';
const sourcePath=p=>/^frontend\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(svelte|css|js|ts)$/.test(p)&&!p.split('/').some(s=>s.startsWith('.'));
const escapeText=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/{/g,'&#123;').replace(/}/g,'&#125;');
const escapeAttr=s=>escapeText(s).replace(/"/g,'&quot;');
function materialize(files,elements,operations,overrides={}){
 const out={...overrides},edits=new Map();
 for(const [id,op]of Object.entries(operations)){
  const e=elements.find(e=>e.id===id);if(!e||Object.hasOwn(overrides,e.path))throw Error('Salve o código antes de voltar à edição visual.');
  const list=edits.get(e.path)||[];
  if(Object.hasOwn(op,'text')){if(!e.text)throw Error('Este texto é dinâmico. Use Código Svelte.');list.push({start:e.text.start,end:e.text.end,value:escapeText(op.text)});}
  if(Object.hasOwn(op,'style')){if(!e.style)throw Error('Este estilo é dinâmico. Use Código Svelte.');list.push({start:e.style.start,end:e.style.end,value:' style="'+escapeAttr(op.style)+'"'});}
  edits.set(e.path,list);
 }
 for(const [path,list]of edits){let s=files[path],last=s.length+1;for(const e of list.sort((a,b)=>b.start-a.start||b.end-a.end)){if(e.end>last)throw Error('Alterações sobrepostas. Salve uma por vez.');s=s.slice(0,e.start)+e.value+s.slice(e.end);last=e.start;}out[path]=s;}
 return out;
}
// Only selection hints and literal-text proposals leave the child. It never
// receives authentication, access to source files, or a persistence callback.
function selectionClient(){
 let editing=false,selected=null,entry=null,original='';
 // Cursors visualize persisted source actions on the rendered elements. They
 // do not claim a browser agent clicked, tested, or authored DOM with a mouse.
 const actors={architect:['Atlas','#d4b477'],ux:['Lia','#f0b4a2'],designer:['Cora','#a9baff'],interface:['Íris','#b29cdd'],reviewer:['Vega','#8ac6ac']};
 let activityVersion=0,activityKey='',liveActor='';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function paintActions(actions){
  for(const action of (actions||[]).slice(-3)){
   if(!actors[action.agent]||!Array.isArray(action.ids))continue;
   const targets=Array.from(document.querySelectorAll('[data-genesis-node]')).filter(el=>action.ids.includes(el.getAttribute('data-genesis-node'))).filter(el=>{const b=el.getBoundingClientRect();return b.width>20&&b.height>12&&b.top<innerHeight-35&&b.bottom>20&&b.left<innerWidth&&b.right>0;}).slice(0,7);
   if(!targets.length)continue;
   const [name,color]=actors[action.agent],cursor=document.createElement('div');
   cursor.setAttribute('aria-hidden','true');cursor.setAttribute('data-genesis-cursor',action.agent);cursor.style.cssText='position:fixed;top:0;left:0;z-index:2147483646;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 2px #0003)';
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','25');svg.setAttribute('height','30');svg.setAttribute('viewBox','0 0 25 30');
   const arrow=document.createElementNS('http://www.w3.org/2000/svg','path');arrow.setAttribute('d','M2 2L21 18L12 19L8 27Z');arrow.setAttribute('fill',color);arrow.setAttribute('stroke','white');arrow.setAttribute('stroke-width','1.5');svg.append(arrow);
   const label=document.createElement('span');label.textContent=name+(action.kind==='file.read'?' · revisando':' · criando');label.style.cssText='display:block;white-space:nowrap;margin-left:18px;margin-top:-6px;padding:5px 9px;border-radius:5px;background:'+color+';color:#182127;font:600 11px system-ui';cursor.append(svg,label);document.body.append(cursor);
   if(!action.working&&liveActor===action.agent)cursor.style.opacity='0';
   let from={x:innerWidth*.52,y:innerHeight*.35},index=0,visits=0;const version=activityVersion;
   const visit=()=>{
    if(action.working&&version!==activityVersion){cursor.remove();return;}
    if(index>=targets.length&&action.working)index=0;
    if(index>=targets.length){cursor.style.transition='opacity .35s';cursor.style.opacity='0';setTimeout(()=>cursor.remove(),400);return;}
    const target=targets[index++],rect=target.getBoundingClientRect(),to={x:Math.max(5,Math.min(innerWidth-130,rect.left+Math.min(rect.width*(action.working?.25+(visits++%3)*.2:.6),180))),y:Math.max(5,Math.min(innerHeight-60,rect.top+Math.min(rect.height*.5,70)))};
    const started=performance.now(),duration=reduced.matches?0:420;
    const frame=now=>{const t=duration?Math.min(1,(now-started)/duration):1,e=1-Math.pow(1-t,3);cursor.style.transform='translate('+(from.x+(to.x-from.x)*e)+'px,'+(from.y+(to.y-from.y)*e)+'px)';if(t<1){requestAnimationFrame(frame);return;}
     const box=document.createElement('div');box.setAttribute('aria-hidden','true');box.style.cssText='position:fixed;pointer-events:none;z-index:2147483645;border:1px solid '+color+';border-radius:6px;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;box-sizing:border-box';document.body.append(box);
     if(action.kind==='file.written'&&!reduced.matches)target.animate([{opacity:.25,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'ease-out'});
     setTimeout(()=>box.remove(),650);from=to;setTimeout(visit,reduced.matches?70:360);
    };requestAnimationFrame(frame);
   };visit();
  }
 }
 addEventListener('message',event=>{
  if(event.source!==parent)return;
  if(event.data?.type==='arkom.agents.actions')paintActions(event.data.actions);
  if(event.data?.type==='arkom.agents.state'){const key=JSON.stringify(event.data);if(key===activityKey)return;activityKey=key;activityVersion++;liveActor=event.data.working?event.data.agent:'';for(const cursor of document.querySelectorAll('[data-genesis-cursor]'))cursor.remove();if(event.data.working)paintActions([{agent:event.data.agent,ids:event.data.ids,kind:'file.generating',working:true}]);}
 });

 const send=(type,extra={})=>parent.postMessage({type,...extra},'*');
 const finish=cancel=>{if(!entry)return;const el=entry;entry=null;el.removeAttribute('contenteditable');if(cancel)el.textContent=original;else send('arkom.editor.text',{id:el.getAttribute('data-genesis-node'),text:el.textContent});};
 const focus=el=>{if(selected)selected.style.removeProperty('outline');selected=el;if(el){el.style.outline='2px solid #bd9b5e';send('arkom.editor.select',{id:el.getAttribute('data-genesis-node')});}};
 document.addEventListener('click',event=>{if(!editing)return;event.preventDefault();event.stopImmediatePropagation();const el=event.target.closest?.('[data-genesis-node]');if(entry&&entry!==el)finish(false);focus(el);},true);
 document.addEventListener('dblclick',event=>{if(!editing)return;const el=event.target.closest?.('[data-genesis-node]');if(!el||!el.hasAttribute('data-genesis-literal'))return;event.preventDefault();event.stopImmediatePropagation();finish(false);entry=el;original=el.textContent;el.contentEditable='plaintext-only';el.focus();const range=document.createRange();range.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(range);},true);
 document.addEventListener('keydown',event=>{if(entry&&(event.key==='Escape'||event.key==='Enter'&&!event.shiftKey)){event.preventDefault();event.stopImmediatePropagation();finish(event.key==='Escape');}},true);
 document.addEventListener('input',()=>{if(entry)send('arkom.editor.text',{id:entry.getAttribute('data-genesis-node'),text:entry.textContent});},true);
 document.addEventListener('focusout',()=>finish(false),true);
 document.addEventListener('submit',event=>{if(editing){event.preventDefault();event.stopImmediatePropagation();}},true);
 addEventListener('message',event=>{if(event.source!==parent)return;const data=event.data;
  if(data?.type==='arkom.editor.mode'){const next=!!data.editing;if(editing&&!next)finish(false);editing=next;document.documentElement.style.cursor=editing?'crosshair':'';if(!editing)focus(null);}
  if(data?.type==='arkom.editor.preview'&&typeof data.id==='string')for(const el of document.querySelectorAll('[data-genesis-node]'))if(el.getAttribute('data-genesis-node')===data.id){if(typeof data.text==='string'&&el!==entry)el.textContent=data.text;if(typeof data.style==='string')el.setAttribute('style',data.style);}
 });
}
function create(files,api,options){
 const doc=global.document,box=doc.createElement('div');
 box.className='genesis-frontend-editor';box.style.cssText='height:100%;display:flex;flex-direction:column;min-width:0;background:#101214;color:#eee;font:12px system-ui';
 let pendingActions=[],seenActions=new Set();
 let saved={...files},sequence=options.sequence,operations={},overrides={},undo=[],redo=[],selected='',editing=false,busy=false,conflict=false,disposed=false,elements=[],frame,preview;
 const parse=()=>{try{elements=JSON.parse(saved['frontend/build.json']||'{}').elements||[];}catch{elements=[];}};parse();
 const bar=doc.createElement('div');bar.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:9px;border-bottom:1px solid #303237';
 const status=doc.createElement('span');status.setAttribute('role','status');status.style.cssText='font-size:11px;color:#cdb27f;padding:3px 9px;max-height:90px;overflow:auto;white-space:pre-wrap';
 function button(label,fn,parent=bar){const b=doc.createElement('button');b.type='button';b.textContent=label;b.style.cssText='font:inherit;color:inherit;background:#23262a;border:1px solid #41454b;border-radius:6px;padding:7px 10px;cursor:pointer';b.addEventListener('click',fn);parent.append(b);return b;}
 const toggle=button('Editar diretamente',()=>{editing=!editing;mode();});
 const code=button('Código Svelte',()=>{sourcePanel.hidden=!sourcePanel.hidden;inspector.hidden=true;if(!sourcePanel.hidden)loadSource();});
 const back=button('Desfazer',()=>restore(undo,redo)),forward=button('Refazer',()=>restore(redo,undo));
 const save=button('Salvar frontend',()=>void persist()),reopen=button('Reabrir versão salva',()=>void reload());reopen.hidden=true;bar.append(status);box.append(bar);
 const stage=doc.createElement('div');stage.style.cssText='position:relative;flex:1;min-height:0;display:flex;flex-direction:column';box.append(stage);
 const dirty=()=>Object.keys(operations).length>0||Object.keys(overrides).length>0;
 const state=()=>JSON.stringify({operations,overrides});
 const checkpoint=()=>{undo.push(state());if(undo.length>35)undo.shift();redo=[];};
 function refreshStatus(message){toggle.hidden=!!options.running||options.editable===false;code.hidden=back.hidden=forward.hidden=save.hidden=(!editing&&!dirty()&&sourcePanel.hidden)||options.editable===false;save.textContent=elements.length?'Salvar frontend':'Preparar edição visual';status.textContent=message||(conflict?'O projeto mudou. Seu rascunho foi preservado.':dirty()?'Alterações no rascunho':options.running?'Os agentes estão construindo sua página…':'Peça ajustes na conversa');save.disabled=busy||options.running||conflict;toggle.disabled=busy||options.running;back.disabled=busy||!undo.length;forward.disabled=busy||!redo.length;reopen.hidden=!conflict;}
 function flushState(){if(!frame)return;const latest=(options.actions||[]).filter(e=>e.agent===options.activeAgent).at(-1);const matching=elements.filter(e=>e.path===latest?.path);frame.contentWindow?.postMessage({type:'arkom.agents.state',working:!!options.running,agent:options.activeAgent,ids:(matching.length?matching:elements).map(e=>e.id)},'*');}
 function mode(){toggle.textContent=editing?'Voltar à prévia':'Editar diretamente';toggle.setAttribute('aria-pressed',String(editing));frame?.contentWindow?.postMessage({type:'arkom.editor.mode',editing:editing&&!busy&&!options.running},'*');if(!editing)inspector.hidden=true;if(sourcePanel)refreshStatus();flushState();}
 function repaint(){for(const e of elements){const op=operations[e.id]||{};frame?.contentWindow?.postMessage({type:'arkom.editor.preview',id:e.id,...(e.text?{text:op.text??e.text.value}:{}),...(e.style?{style:op.style??e.style.value}:{})},'*');}mode();refreshStatus();}
 function restore(from,to){if(!from.length)return;to.push(state());const v=JSON.parse(from.pop());operations=v.operations;overrides=v.overrides;repaint();if(selected)inspect(selected);if(!sourcePanel.hidden)loadSource();}
 function mount(){if(preview)preview.remove();preview=global.genesisPreview.createPreview(saved,api.runtime,true);preview.style.flex='1';preview.style.minHeight='0';stage.prepend(preview);frame=preview.tagName==='IFRAME'?preview:preview.querySelector('iframe');frame.addEventListener('load',()=>{if(!disposed){repaint();flushActions();flushState();}});mode();}
 function panel(){const p=doc.createElement('div');p.style.cssText='position:absolute;z-index:8;right:12px;bottom:12px;max-height:65%;overflow:auto;width:min(310px,calc(100% - 24px));box-sizing:border-box;background:#191c20;color:#eee;border:1px solid #555044;border-radius:10px;padding:14px;box-shadow:0 12px 35px #0006';stage.append(p);p.hidden=true;return p;}
 const inspector=panel(),selectedLabel=doc.createElement('strong');inspector.append(selectedLabel);button('×',()=>{inspector.hidden=true;},inspector).setAttribute('aria-label','Fechar propriedades');
 const hint=doc.createElement('p');hint.textContent='A alteração vale para este elemento no componente, incluindo suas repetições.';hint.style.cssText='font-size:11px;line-height:1.5;color:#aaa';inspector.append(hint);
 function field(parent,label,tag='input'){const l=doc.createElement('label');l.textContent=label;l.style.cssText='display:block;font-size:11px;margin-top:9px';const input=doc.createElement(tag);input.setAttribute('aria-label',label);input.style.cssText='display:block;box-sizing:border-box;width:100%;margin-top:5px;padding:8px;background:#101214;border:1px solid #494d53;border-radius:5px;color:#eee;font:12px system-ui';l.append(input);parent.append(l);return input;}
 const textInput=field(inspector,'Texto do elemento','textarea');textInput.rows=3;textInput.addEventListener('input',()=>changeText(textInput.value));
 const styleInputs={};
 for(const [name,label]of [['color','Cor do texto'],['background-color','Cor de fundo'],['font-size','Tamanho da fonte'],['padding','Espaçamento interno'],['margin','Espaçamento externo'],['border-radius','Arredondamento'],['width','Largura'],['max-width','Largura máxima']]){
  const input=field(inspector,label);input.placeholder=name.includes('color')?'#263c32':'24px';input.addEventListener('change',()=>{if(busy)return;const e=elements.find(e=>e.id===selected);if(!e?.style)return;const style=doc.createElement('span').style;style.cssText=operations[selected]?.style??e.style.value;if(input.value.trim())style.setProperty(name,input.value.trim());else style.removeProperty(name);checkpoint();operations[selected]={...operations[selected],style:style.cssText};repaint();});styleInputs[name]=input;
 }
 function changeText(value){if(busy)return;const e=elements.find(e=>e.id===selected);if(!e?.text||Object.hasOwn(overrides,e.path)){refreshStatus('Este conteúdo usa lógica. Use Código Svelte.');repaint();return;}checkpoint();operations[selected]={...operations[selected],text:value};repaint();}
 function inspect(id){const e=elements.find(e=>e.id===id);if(!e)return;selected=id;inspector.hidden=false;sourcePanel.hidden=true;selectedLabel.textContent='<'+e.tag+'> · '+e.path.split('/').pop();textInput.disabled=!e.text||Object.hasOwn(overrides,e.path);textInput.value=operations[id]?.text??e.text?.value??'';const style=doc.createElement('span').style;style.cssText=operations[id]?.style??e.style?.value??'';for(const [name,input]of Object.entries(styleInputs)){input.disabled=!e.style||Object.hasOwn(overrides,e.path);input.value=style.getPropertyValue(name);}}
 const sourcePanel=panel();sourcePanel.style.width='calc(100% - 24px)';sourcePanel.style.maxHeight='85%';
 const title=doc.createElement('strong');title.textContent='Seu código Svelte';sourcePanel.append(title);button('Fechar código',()=>{sourcePanel.hidden=true;},sourcePanel);
 const sourceHint=doc.createElement('p');sourceHint.textContent='Edite componentes, CSS e lógica do frontend. Salvar compila a página; erros preservam a versão anterior.';sourcePanel.append(sourceHint);
 const sourceSelect=doc.createElement('select');sourceSelect.setAttribute('aria-label','Arquivo do frontend');sourceSelect.style.cssText='width:100%;padding:7px;background:#23262a;color:#eee';sourceSelect.addEventListener('change',loadSource);sourcePanel.append(sourceSelect);
 const sourceArea=field(sourcePanel,'Código do frontend','textarea');sourceArea.rows=15;sourceArea.spellcheck=false;sourceArea.style.fontFamily='monospace';
 sourceArea.addEventListener('input',()=>{if(busy)return;const path=sourceSelect.value;checkpoint();try{overrides={...materialize(saved,elements,operations,overrides),[path]:sourceArea.value};operations={};refreshStatus();}catch(e){refreshStatus(e.message);}});
 const newName=field(sourcePanel,'Novo arquivo em frontend/src/');newName.placeholder='components/Card.svelte';
 button('Adicionar arquivo',()=>{if(busy)return;const path='frontend/src/'+newName.value.trim();if(!sourcePath(path)||Object.hasOwn(saved,path)||Object.hasOwn(overrides,path)){refreshStatus('Use um nome novo .svelte, .css, .js ou .ts.');return;}checkpoint();overrides[path]=path.endsWith('.svelte')?'<section>Seu novo componente</section>\n':'';newName.value='';loadSource(path);refreshStatus('Importe o novo arquivo para aparecer na página.');},sourcePanel);
 function loadSource(p){try{const draft={...saved,...materialize(saved,elements,operations,overrides)};const path=typeof p==='string'?p:(sourceSelect.value||'frontend/src/App.svelte');sourceSelect.replaceChildren();for(const name of Object.keys(draft).filter(sourcePath).sort()){const opt=doc.createElement('option');opt.value=opt.textContent=name;sourceSelect.append(opt);}sourceSelect.value=path;sourceArea.value=draft[path]??'';}catch(e){refreshStatus(e.message);}}
 function receive(event){if(event.origin!=='null'||event.source!==frame?.contentWindow||!box.isConnected||busy||!editing)return;if(event.data?.type==='arkom.editor.select'&&typeof event.data.id==='string')inspect(event.data.id);if(event.data?.type==='arkom.editor.text'&&event.data.id===selected&&typeof event.data.text==='string'&&event.data.text.length<12000){changeText(event.data.text);textInput.value=event.data.text;}}
 global.addEventListener('message',receive);
 async function persist(){if(busy||options.running||conflict)return;busy=true;mode();refreshStatus('Compilando e salvando…');sourceArea.disabled=true;
  try{const draft=materialize(saved,elements,operations,overrides);if(!Object.keys(draft).length)draft['frontend/src/App.svelte']=saved['frontend/src/App.svelte'];const result=await api.save({sequence,files:draft});if(disposed)return;saved={...result.files};sequence=result.build.sequence;operations={};overrides={};conflict=false;undo=[];redo=[];selected='';parse();mount();inspector.hidden=true;sourcePanel.hidden=true;refreshStatus('Frontend salvo. Prévia atualizada.');}
  catch(error){if(!disposed){if(error.code==='frontend_edit_conflict')conflict=true;refreshStatus(error.message);}}
  finally{busy=false;sourceArea.disabled=false;if(!disposed){mode();refreshStatus(status.textContent);}}
 }
 async function reload(){try{const latest=await api.refresh();if(disposed)return;operations={};overrides={};undo=[];redo=[];conflict=false;apply(latest.files,{sequence:latest.build.sequence,running:latest.build.status==='running'});}catch(e){refreshStatus(e.message);}}
 function enqueueActions(actions){for(const e of actions||[])if(!seenActions.has(e.sequence)&&['interface','reviewer','designer','ux','architect'].includes(e.agent)){seenActions.add(e.sequence);pendingActions.push(e);}if(pendingActions.length>20)pendingActions=pendingActions.slice(-20);}
 function flushActions(){if(!frame||!pendingActions.length)return;const actions=pendingActions.splice(0).map(e=>({agent:e.agent,kind:e.kind,ids:elements.filter(n=>n.path===e.path&&['h1','h2','h3','p','section','button','img','nav','header','article'].includes(n.tag)).map(n=>n.id)}));frame.contentWindow?.postMessage({type:'arkom.agents.actions',actions},'*');}
 function apply(next,opts){options={...options,...opts};enqueueActions(opts.actions);if(busy)return;if(opts.sequence!==sequence&&dirty()){conflict=true;refreshStatus();return;}
  if(!next['frontend/index.html']||!next['frontend/build.json']||!next['frontend/bundle.js']){sequence=opts.sequence;mode();refreshStatus();return;}
  if(!dirty()&&next['frontend/build.json']===saved['frontend/build.json']){saved={...next};sequence=opts.sequence;mode();refreshStatus();if(pendingActions.every(e=>e.kind==='file.read'))flushActions();return;}
 if(opts.sequence===sequence){mode();return;}if(dirty()||busy){conflict=true;refreshStatus();return;}saved={...next};sequence=opts.sequence;parse();mount();refreshStatus();}
 const timer=setInterval(async()=>{if(disposed||doc.hidden||busy)return;try{const latest=await api.refresh();if(!disposed&&latest.build.sequence!==sequence)apply(latest.files,{sequence:latest.build.sequence,running:latest.build.status==='running'});}catch(e){refreshStatus(e.message);}},8000);
 enqueueActions(options.actions);mount();refreshStatus(options.running?'Os agentes estão construindo sua página…':'Peça uma mudança na conversa.');
 return {element:box,update:apply,hasDraft:dirty,dispose(){disposed=true;clearInterval(timer);global.removeEventListener('message',receive);}};
}
global.genesisFrontendEditor={create,selectionClient,materialize,sourcePath};
if(typeof module!=='undefined')module.exports={materialize,sourcePath,escapeText};
})(globalThis);
