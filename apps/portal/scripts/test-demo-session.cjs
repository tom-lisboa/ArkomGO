const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/components/demo-runtime/session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(request){const exports={};vm.runInNewContext(source,{exports,require:()=>({request}),Date,Promise});return exports}
test('parallel screen mounts reuse one session request', async()=>{
 let calls=0, resolve;
 const session={access_token:'test-session',identity:{organization_id:'test'}};
 const cache=setup(()=>{calls++;return new Promise(r=>{resolve=r})});
 const one=cache.demoSession(),two=cache.demoSession();resolve(session);
 assert.equal(await one,session);assert.equal(await two,session);
 assert.equal(await cache.demoSession(),session);assert.equal(calls,1);
});
test('failed login can be retried and explicit expiry clears the session',async()=>{
 let calls=0;
 const cache=setup(()=>{calls++;return calls===1?Promise.reject(new Error('offline')):Promise.resolve({access_token:String(calls)})});
 await assert.rejects(cache.demoSession());assert.equal((await cache.demoSession()).access_token,'2');
 cache.forgetDemoSession();assert.equal((await cache.demoSession()).access_token,'3');
});
