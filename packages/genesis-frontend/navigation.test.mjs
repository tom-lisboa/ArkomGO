import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { compileFrontend } from './compiler.mjs';
const plan = JSON.parse(readFileSync(new URL('./testdata/navigation.json',import.meta.url),'utf8'));
const fixture = () => ({
 'design/navigation.json':JSON.stringify(plan),
 'frontend/src/App.svelte':`<script>import Router from '@arkom/Router.svelte';import {routes,current,href} from '@arkom/navigation';let expanded=$state(false);</script><header><strong>Clientes — exemplo da plataforma</strong><button onclick={()=>expanded=!expanded}>Menu {expanded?'aberto':'fechado'}</button><nav aria-label="Principal">{#each routes.filter(r=>r.menu) as route}<a href={href(route.path)} aria-current={$current.route?.path===route.path?'page':undefined}>{route.title}</a>{/each}</nav></header><main><Router /></main>`,
 'frontend/src/pages/Clients.svelte':`<script>import {href} from '@arkom/navigation';</script><h1>Clientes</h1><a href={href('/clientes/42')}>Abrir cliente 42</a>`,
 'frontend/src/pages/Create.svelte':`<script>import {navigate} from '@arkom/navigation';let name=$state('');let error=$state('');async function save(e){e.preventDefault();try{const r=await fetch('/api/clients',{method:'POST',body:JSON.stringify({name})});if(!r.ok)throw Error('Não foi possível salvar');navigate('/clientes/'+encodeURIComponent((await r.json()).id));}catch(e){error=e.message;}}</script><h1>Novo cliente</h1><form onsubmit={save}><label>Nome<input bind:value={name} required /></label><button>Salvar cliente</button></form><p role="alert">{error}</p>`,
 'frontend/src/pages/Client.svelte':`<script>let {params}=$props();</script><h1>Cliente {params.id}</h1>`,
});
const settle=()=>new Promise(r=>setTimeout(r,25));
test('shared Svelte layout supports list/create/detail, history, direct entry and unknown routes',async()=>{
 const result=await compileFrontend(fixture());
 assert.deepEqual(result.navigation,plan);
 assert.deepEqual(result.warnings,[]);
 const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/app/#/clientes',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window; const d=w.document;
 try {
  const calls=[];w.fetch=async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return {ok:true,json:async()=>({id:'77'})}};
  w.eval(result.javascript);await settle();
  assert.equal(d.querySelector('h1').textContent,'Clientes');
  assert.equal(d.querySelector('[aria-current="page"]').textContent,'Clientes');
  d.querySelector('header button').click();await settle();
  d.querySelector('a[href="#/clientes/novo"]').click();await settle();
  assert.equal(d.querySelector('h1').textContent,'Novo cliente'); // static beats :id
  d.querySelector('input').value='Ana';d.querySelector('input').dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(w.location.hash,'#/clientes/77');assert.equal(d.querySelector('h1').textContent,'Cliente 77');
  assert.deepEqual(calls,[{path:'/api/clients',body:{name:'Ana'}}]);
  assert.equal(d.querySelector('header button').textContent,'Menu aberto');
  assert.equal(d.activeElement.getAttribute('aria-label'),'Detalhe do cliente');
  w.history.back();await settle();assert.equal(d.querySelector('h1').textContent,'Novo cliente');
  w.history.forward();await settle();assert.equal(d.querySelector('h1').textContent,'Cliente 77');
  w.location.hash='#/nao-existe';await settle();assert.equal(d.querySelector('h1').textContent,'Página não encontrada');
  d.querySelector('main a').click();await settle();assert.equal(d.querySelector('h1').textContent,'Clientes');
  w.location.hash='#/clientes/%E0%A4%A';await settle();assert.equal(d.querySelector('h1').textContent,'Página não encontrada');
 } finally {w.close();}
 const direct=new JSDOM('<div id="app"></div>',{url:'https://example.test/app/#/clientes/123',runScripts:'outside-only',pretendToBeVisual:true});
 try {direct.window.eval(result.javascript);await settle();assert.equal(direct.window.document.querySelector('h1').textContent,'Cliente 123');}finally{direct.window.close();}
});
test('navigation rejects missing/ambiguous pages and requires bundled host router',async()=>{
 const missing=fixture();delete missing['frontend/src/pages/Client.svelte'];await assert.rejects(compileFrontend(missing),/tela declarada/);
 const noRouter=fixture();noRouter['frontend/src/App.svelte']='<h1>Only one page</h1>';await assert.rejects(compileFrontend(noRouter),/roteador compartilhado/);
 for(const mutate of [p=>p.routes.push({...p.routes[1],path:'/clientes/:other'}),p=>p.home='/missing',p=>p.routes[0].component='../../secret.svelte',p=>p.routes[0].path='https://external.test',p=>p.routes[0].menu='yes',p=>p.routes[1].menu=true,p=>p.routes[0].extra=true]) {
  const files=fixture(),p=structuredClone(plan);mutate(p);files['design/navigation.json']=JSON.stringify(p);await assert.rejects(compileFrontend(files));
 }
 const files=fixture();delete files['design/navigation.json'];await assert.rejects(compileFrontend(files),/Build failed/);
});

test('routed preview opens direct details and create flow uses the authenticated API bridge',async()=>{
 const {createRequire}=await import('node:module');const {MessageChannel}=await import('node:worker_threads');
 const {compilePreview}=createRequire(import.meta.url)('../../apps/genesis_flutter/web/preview.js');
 const result=await compileFrontend(fixture());const files={'frontend/index.html':'<div id="app"></div><script src="./bundle.js"></script>','frontend/bundle.js':result.javascript};
 const parser=new JSDOM('');const html=compilePreview(files,parser.window.DOMParser,true,'/clientes/novo');parser.window.close();
 const calls=[];
 const dom=new JSDOM(html,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,beforeParse(w){w.Response=Response;w.MessageChannel=MessageChannel;w.postMessage=(message,origin,ports)=>{calls.push(message.request);ports[0].postMessage({status:200,content_type:'application/json',body:'{"id":"99"}'});ports[0].close();};}});
 try {
  await new Promise(r=>dom.window.addEventListener('load',r,{once:true}));await settle();
  const d=dom.window.document;assert.equal(d.querySelector('h1').textContent,'Novo cliente');
  d.querySelector('input').value='Cliente exemplo';d.querySelector('input').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  d.querySelector('form button').click();
  const deadline=Date.now()+2000;while(d.querySelector('h1').textContent!=='Cliente 99' && Date.now()<deadline)await settle();
  assert.equal(d.querySelector('h1').textContent,'Cliente 99');assert.equal(calls[0].path,'/api/clients');
 }finally{dom.window.close();}
});
