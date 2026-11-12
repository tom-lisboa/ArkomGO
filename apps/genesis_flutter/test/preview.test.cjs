const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const {compilePreview,policy}=require('../web/preview.js');
const Parser=new JSDOM('').window.DOMParser;
test('preview assembles local styles and scripts with restrictive CSP',()=>{
 const files={'frontend/index.html':'<html><head><base href="https://evil.example/"><link rel="stylesheet" href="./styles.css"></head><body><button>Calculate</button><script src="./app.js"></script><script src="https://evil.example/track.js"></script><iframe src="https://evil.example/"></iframe></body></html>','frontend/styles.css':'button{color:gold}','frontend/app.js':'document.title="calculator";'};
 const html=compilePreview(files,Parser);const doc=new Parser().parseFromString(html,'text/html');
 assert.equal(doc.querySelector('style').textContent,files['frontend/styles.css']);assert.match(doc.querySelector('script').src,/^data:text\/javascript;base64,/);assert.equal(doc.querySelectorAll('script').length,1);assert.equal(doc.querySelectorAll('base,iframe').length,0);assert.equal(doc.querySelector('meta[http-equiv]').content,policy);assert.match(policy,/connect-src 'none'/);assert.match(policy,/form-action 'none'/);
});
test('preview requires an actual interface',()=>{assert.throws(()=>compilePreview({},Parser),/interface/)});
test('sandbox grants scripts only, never same-origin or navigation permissions',()=>{const source=require('fs').readFileSync(require.resolve('../web/preview.js'),'utf8');assert.match(source,/setAttribute\('sandbox','allow-scripts'\)/);assert.ok(!source.includes('allow-same-origin'));assert.ok(!source.includes('allow-top-navigation'));});

test('runtime bridge checks source, opaque origin, connection and payload; child fetch receives only the reply',async()=>{
 const vm=require('node:vm');const fs=require('node:fs');
 const outer=new JSDOM('<body></body>',{runScripts:'outside-only',url:'http://localhost:3007'});
 const win=outer.window;let receive;
 win.addEventListener=(type,fn)=>{if(type==='message')receive=fn};
 win.eval(fs.readFileSync(require.resolve('../web/preview.js'),'utf8'));
 const calls=[];
 const frame=win.genesisPreview.createPreview({'frontend/index.html':'<body><output id="result"></output></body>'},async request=>{calls.push(request);return {status:200,body:'{"result":42}',content_type:'application/json'}});
 win.document.body.append(frame);
 const replies=[];const port={postMessage:value=>replies.push(value),close(){}};
 const request={method:'POST',path:'/api/calculate',body:'{"a":12,"b":30}'};
 const event={origin:'null',source:frame.contentWindow,data:{type:'arkom.preview.request',request},ports:[port]};
 await receive({...event,origin:win.location.origin});await receive({...event,source:{}});
 assert.equal(calls.length,0);
 await receive({...event,data:{...event.data,request:{...request,body:42}}});assert.equal(calls.length,0);assert.match(replies.pop().error,/inválido/);
 await receive(event);assert.equal(calls.length,1);assert.equal(replies.pop().body,'{"result":42}');
 const compiled=new Parser().parseFromString(frame.srcdoc,'text/html');
 assert.equal(compiled.querySelector('meta[http-equiv]').content,policy);
 assert.ok(compiled.head.innerHTML.indexOf('Content-Security-Policy')<compiled.head.innerHTML.indexOf('<script>'));
 const {MessageChannel}=require('node:worker_threads');
 const child={window:{},document:win.document,Response,MessageChannel,setTimeout,clearTimeout,parent:{postMessage:async(data,origin,ports)=>{assert.equal(origin,'*');await receive({...event,data,ports})}}};
 vm.runInNewContext(compiled.querySelector('script').textContent,child);
 const result=await child.window.fetch('/api/calculate',{method:'POST',body:request.body});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{result:42});
 await assert.rejects(()=>child.window.fetch('https://example.com/api/calculate'),/somente/);
 frame.remove();await receive(event);assert.equal(calls.length,2);
 outer.window.close();
});

test('preview delivers validated form events without enabling native submissions',()=>{
 const files={'frontend/index.html':'<form id="notes"><input required name="text"><button type="submit"><span>Adicionar</span></button><button type="button">Atualizar</button></form>'};
 const dom=new JSDOM(compilePreview(files,Parser,true),{runScripts:'outside-only'});
 const win=dom.window,doc=win.document;win.eval(doc.querySelector('script').textContent);
 const form=doc.querySelector('form'),submit=doc.querySelector('button'),input=doc.querySelector('input');
 let submitted=0;
 form.addEventListener('submit',event=>{submitted++;assert.equal(event.submitter,submit);event.preventDefault()});
 function click(target){const event=new win.MouseEvent('click',{bubbles:true,cancelable:true,button:0});target.dispatchEvent(event);return event;}
 assert.equal(click(submit).defaultPrevented,true);assert.equal(submitted,0,'required field must be checked');
 input.value='uma anotação';
 assert.equal(click(submit.querySelector('span')).defaultPrevented,true);assert.equal(submitted,1);
 click(doc.querySelector('button[type="button"]'));assert.equal(submitted,1);
 submit.addEventListener('click',event=>event.preventDefault(),{once:true});click(submit);assert.equal(submitted,1,'respect application click handlers');
 form.noValidate=true;input.value='';click(submit);assert.equal(submitted,2);
 assert.match(doc.querySelector('meta[http-equiv]').content,/form-action 'none'/);
 dom.window.close();
});
