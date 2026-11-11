// Exercise the real React component against temporary in-memory responses.
// This is a DOM/unit test, not browser automation or a production API call.
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'frontend/package.json'));
const esbuild=require('esbuild'),React=require('react');
const {JSDOM}=require('jsdom'),{createRoot}=require('react-dom/client');
const {act}=React;
const built=await esbuild.build({entryPoints:[path.join(root,'frontend/src/CustomerData.tsx')],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
const mod=new Module(path.join(root,'frontend/.customer-data-check.cjs'));
mod.filename=path.join(root,'frontend/.customer-data-check.cjs');mod.paths=Module._nodeModulePaths(path.join(root,'frontend'));mod._compile(built.outputFiles[0].text,mod.filename);
const dom=new JSDOM('<div id="root"></div>',{url:'https://client.lovable.app'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let downloaded=0;let blobs=0;
dom.window.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download,'meus-dados-sdr.zip');downloaded++};
const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;URL.createObjectURL=()=>{blobs++;return 'blob:test-only'};URL.revokeObjectURL=()=>{};
const id='exp_'+'a'.repeat(48);let status='queued';const calls=[];
const job=()=>({id,status,createdAt:new Date().toISOString(),capturedAt:status==='ready'?new Date().toISOString():null,expiresAt:new Date(Date.now()+3600000).toISOString(),downloadPath:null,errorCode:null});
const session={access_token:'unit-test-only',identity:{user_id:'alfa.admin',organization_id:'org_demo_alfa',role:'admin',environment:'test'}};
const previous=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 assert(String(url).startsWith('https://24.199.100.186/sdr-next/v1/customer/'));
 assert.equal(options.headers.Authorization,'Bearer unit-test-only');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
 calls.push({url:String(url),options});
 if(String(url).endsWith('/graphql'))return Response.json({data:{customer:{organizationId:'org_demo_alfa',exports:[],workerUsage:{available:true,retentionDays:90,report:{workers:[{id:'context',starts:3,completed:2,failed:1}]}}}}});
 if(String(url).endsWith('/exports')){assert(options.headers['Idempotency-Key']);assert.equal(options.body,'{}');return Response.json(job(),{status:202})}
 if(String(url).endsWith('/content'))return new Response(new Blob(['fake-zip-bytes'],{type:'application/zip'}));
 status='ready';return Response.json(job());
};
const app=createRoot(document.getElementById('root'));
try{
 await act(async()=>{app.render(React.createElement(mod.exports.default,{session}));await new Promise(resolve=>setTimeout(resolve,0))});
 assert(document.body.textContent.includes('Meus dados'));assert(document.body.textContent.includes('context'));
 const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Baixar meus dados'));assert(button&&!button.disabled);
 await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,3200))});
 assert.equal(downloaded,1);assert.equal(blobs,1);assert.equal(calls.filter(c=>c.url.endsWith('/exports')).length,1);
 assert(document.body.textContent.includes('Pronto para baixar'));
 assert(calls.every(c=>!c.options.body||!JSON.parse(c.options.body).organization_id));
 await act(async()=>app.unmount());
}finally{globalThis.fetch=previous;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close()}
console.log(JSON.stringify({passed:true,real_component:true,authenticated_zip_download:true,polling_checked:true,client_cannot_select_company:true,external_network_calls:0,browser_visual_verified:false}));
