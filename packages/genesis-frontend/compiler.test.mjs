import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { compileFrontend } from './compiler.mjs';

test('compiles real Svelte components, TypeScript, CSS and reactive interaction', async () => {
  const result = await compileFrontend({
    'frontend/src/App.svelte': `<script lang="ts">import Counter from './Counter.svelte'; import './style.css'; let label: string = 'Contagem';</script><main><h1>{label}</h1><Counter /></main>`,
    'frontend/src/Counter.svelte': `<script>import {value} from './value.svelte.js';</script><button onclick={()=>value.count++}>Total: {value.count}</button><style>button{color:teal}</style>`,
    'frontend/src/value.svelte.js': 'export const value = $state({count:0});',
    'frontend/src/style.css': 'body{margin:0}',
  });
  assert.ok(result.javascript.length > 1000);
  assert.match(result.css, /margin:0/);
  assert.deepEqual(result.warnings, []);
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError',error=>errors.push(error.message));
  const dom = new JSDOM('<div id="app"></div>', {runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  dom.window.eval(result.javascript);
  const button = dom.window.document.querySelector('button');
  assert.equal(button.textContent, 'Total: 0');
  button.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(button.textContent, 'Total: 1');
  assert.equal(dom.window.document.querySelector('h1').textContent,'Contagem');
  assert.deepEqual(errors, []);
  dom.window.close();
});

test('returns accessibility diagnostics and never executes application sources at build time', async () => {
  const result = await compileFrontend({'frontend/src/App.svelte': `<script>throw new Error('application executed during build');</script><img src="data:image/png;base64," />`});
  assert.ok(result.warnings.some(v=>v.code==='a11y_missing_attribute' && v.file==='frontend/src/App.svelte'));
  assert.match(result.javascript,/application executed during build/);
});

test('rejects malformed sources, missing components, external imports and filesystem escapes', async () => {
  const bad = [
    '<script>let =</script>',
    `<script>import X from './Missing.svelte';</script><X />`,
    `<script>import fs from 'node:fs';</script><p>{fs}</p>`,
    `<script>import x from 'https://example.com/x.js';</script><p>{x}</p>`,
    `<script>import x from '/etc/passwd';</script><p>{x}</p>`,
    `<script>import x from '../../../outside.js';</script><p>{x}</p>`,
    `<script>import x from 'react';</script><p>{x}</p>`,
    `<script>import './style.css';</script>`,
  ];
  for (const source of bad) {
    await assert.rejects(compileFrontend({'frontend/src/App.svelte':source,'frontend/src/style.css':'body{background:url(https://example.com/a.png)}'}));
  }
  await assert.rejects(compileFrontend({}),/App.svelte/);
  await assert.rejects(compileFrontend({'frontend/src/App.svelte':'x'.repeat(48001)}),/limites/);
  await assert.rejects(compileFrontend({'frontend/src/App.svelte':'<h1>OK</h1>','frontend/src/../escape.js':'alert(1)'}),/limites/);
});

test('compiles frontend fetching declared API without evaluating the request', async () => {
  const result = await compileFrontend({'frontend/src/App.svelte': `<script>let message=$state('');async function save(){ const response=await fetch('/api/notes',{method:'POST',body:JSON.stringify({text:'nota'})}); message=response.ok?'Salvo':'Erro'; }</script><button onclick={save}>Salvar</button><p role="status">{message}</p>`});
  const dom = new JSDOM('<div id="app"></div>',{runScripts:'outside-only',pretendToBeVisual:true});
  const calls=[];
  dom.window.fetch = async (...args)=>{calls.push(args);return {ok:true}};
  dom.window.eval(result.javascript);
  assert.equal(calls.length,0);
  dom.window.document.querySelector('button').click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[0][0],'/api/notes');
  assert.deepEqual(JSON.parse(calls[0][1].body),{text:'nota'});
  assert.equal(dom.window.document.querySelector('[role="status"]').textContent,'Salvo');
  dom.window.close();
});


test('reports sources that are not reachable from the host entrypoint', async () => {
  const result = await compileFrontend({'frontend/src/App.svelte':'<h1>App</h1>', 'frontend/src/main.ts':"import './theme.css';", 'frontend/src/theme.css':'body{color:red}'});
  assert.deepEqual(result.warnings.filter(v=>v.code==='unused_source').map(v=>v.file).sort(),['frontend/src/main.ts','frontend/src/theme.css']);
  assert.equal(result.css,'');
});

test('runs a compiled Svelte form through the existing preview API bridge', async () => {
  const { createRequire } = await import('node:module');
  const { MessageChannel } = await import('node:worker_threads');
  const { compilePreview } = createRequire(import.meta.url)('../../apps/genesis_flutter/web/preview.js');
  const result = await compileFrontend({'frontend/src/App.svelte': `<script>let number=$state(19);let result=$state('');async function submit(event){event.preventDefault();const r=await fetch('/api/sum',{method:'POST',body:JSON.stringify({a:number,b:23})});result=String((await r.json()).result);}</script><form onsubmit={submit}><label>Primeiro número<input type="number" bind:value={number} /></label><button>Somar</button></form><output>{result}</output>`});
  const parser = new JSDOM('');
  const html = compilePreview({'frontend/index.html':'<div id="app"></div><script src="./bundle.js"></script>','frontend/bundle.js':result.javascript},parser.window.DOMParser,true);
  parser.window.close();
  const errors=[];const requests=[];
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole,beforeParse(window){
    window.Response=Response;window.MessageChannel=MessageChannel;
    window.postMessage=(message,origin,ports)=>{
      requests.push(message.request);
      ports[0].postMessage({status:200,content_type:'application/json',body:'{"result":42}'});ports[0].close();
    };
  }});
  try {
    await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));
    dom.window.document.querySelector('button').click();
    const deadline=Date.now()+2000;
    while (dom.window.document.querySelector('output').textContent!=='42' && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(dom.window.document.querySelector('output').textContent,'42');
    assert.equal(requests.length,1);
    assert.equal(requests[0].path,'/api/sum');
    assert.deepEqual(JSON.parse(requests[0].body),{a:19,b:23});
    assert.deepEqual(errors,[]);
  } finally { dom.window.close(); }
});
