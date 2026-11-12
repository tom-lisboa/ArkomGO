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
