const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');
test('visual drafts survive a remote update and iframe messages have an exact source boundary',()=>{
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',url:'http://localhost'});const w=dom.window;
 w.eval(fs.readFileSync(require.resolve('../web/frontend-editor.js'),'utf8'));
 w.genesisPreview={createPreview(){const f=w.document.createElement('iframe');return f;}};
 const element={id:'title',path:'frontend/src/App.svelte',tag:'h1',text:{start:4,end:7,value:'Old'},style:{start:3,end:3,value:''}};
 const files={'frontend/src/App.svelte':'<h1>Old</h1>','frontend/build.json':JSON.stringify({elements:[element]})};
 let saved=0;const editor=w.genesisFrontendEditor.create(files,{runtime:async()=>{},refresh:async()=>{},save:async()=>{saved++;}},{sequence:1});w.document.body.append(editor.element);
 const buttons=()=>Array.from(editor.element.querySelectorAll('button'));buttons().find(e=>e.textContent==='Editar diretamente').click();
 const frame=editor.element.querySelector('iframe');
 const send=source=>w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source,data:{type:'arkom.editor.select',id:'title'}}));
 send({});assert.equal(editor.element.querySelector('strong').textContent,'');send(frame.contentWindow);
 const input=editor.element.querySelector('textarea');input.value='Minha página';input.dispatchEvent(new w.Event('input'));
 editor.update({...files,'frontend/src/App.svelte':'<h1>Remote</h1>'},{sequence:2});
 assert.match(editor.element.textContent,/rascunho foi preservado/);assert.equal(input.value,'Minha página');
 const save=buttons().find(e=>e.textContent==='Salvar frontend');assert.equal(save.disabled,true);save.click();assert.equal(saved,0);
 editor.dispose();dom.window.close();
});
for(const reduced of [false,true])test('cursor actions use real mapped elements and respect reduced motion: '+reduced,()=>{
 const dom=new JSDOM('<body><h1 data-genesis-node="actual">Minha página</h1></body>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.getBoundingClientRect=()=>({left:10,top:10,bottom:90,right:210,width:200,height:80});
 w.matchMedia=()=>({matches:reduced});w.requestAnimationFrame=fn=>{fn(w.performance.now()+500);return 1;};
 let animated=0;w.Element.prototype.animate=()=>{animated++;};
 w.eval(fs.readFileSync(require.resolve('../web/frontend-editor.js'),'utf8'));w.genesisFrontendEditor.selectionClient();
 const send=(source,ids)=>w.dispatchEvent(new w.MessageEvent('message',{source,data:{type:'arkom.agents.actions',actions:[{agent:'interface',kind:'file.written',ids}]}}));
 send({},['actual']);assert.equal(animated,0);send(w,['missing']);assert.equal(w.document.body.textContent,'Minha página');
 send(w,['actual']);assert.match(w.document.body.textContent,/Íris/);assert.equal(animated,reduced?0:1);assert.equal(w.document.querySelector('h1').textContent,'Minha página');
 dom.window.close();
});
test('the agent cursor remains active until its real working state ends',async()=>{
 const dom=new JSDOM('<body><h1 data-genesis-node="actual">Página</h1></body>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.getBoundingClientRect=()=>({left:10,top:10,bottom:90,right:210,width:200,height:80});w.matchMedia=()=>({matches:true});w.requestAnimationFrame=fn=>{fn(w.performance.now()+500);return 1;};
 w.eval(fs.readFileSync(require.resolve('../web/frontend-editor.js'),'utf8'));w.genesisFrontendEditor.selectionClient();
 const state=working=>w.dispatchEvent(new w.MessageEvent('message',{source:w,data:{type:'arkom.agents.state',working,agent:'interface',ids:['actual']}}));
 state(true);await new Promise(r=>setTimeout(r,300));assert.match(w.document.body.textContent,/Íris/);
 state(false);await new Promise(r=>setTimeout(r,120));assert.doesNotMatch(w.document.body.textContent,/Íris/);dom.window.close();
});
