const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('src/app/api/demo/backend/[...path]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(enabled='true'){
 const exports={},forwarded=[];
 vm.runInNewContext(source,{exports,URL,Response,Headers,process:{env:{ARKOM_LOCAL_DEMO:enabled}},fetch:async(url,options)=>{forwarded.push({url,options});return Response.json({ok:true})}});
 return {handler:exports.POST,forwarded};
}
function request(origin='http://127.0.0.1:3007'){
 // Reproduce Next's normalized URL while preserving the incoming Host.
 return {method:'POST',nextUrl:new URL('http://localhost:3007/api/demo/backend/__test/ui/local-enter'),headers:new Headers({host:'127.0.0.1:3007',origin,'content-type':'application/json'}),text:async()=>'{}'};
}
const params={params:Promise.resolve({path:['__test','ui','local-enter']})};
test('same-origin browser login works when Next normalizes hostname',async()=>{
 const {handler,forwarded}=setup();
 assert.equal((await handler(request(),params)).status,200);
 assert.equal(forwarded.length,1);
 assert.equal(forwarded[0].url,'http://127.0.0.1:8080/__test/ui/local-enter');
});
test('cross-origin requests, unsupported routes and disabled demo never reach backend',async()=>{
 const {handler,forwarded}=setup();
 for(const origin of ['https://unrelated.example','http://127.0.0.1:3999','null'])assert.equal((await handler(request(origin),params)).status,403);
 assert.equal((await handler(request(),{params:Promise.resolve({path:['v1','private']})})).status,404);
 assert.equal(forwarded.length,0);
 const disabled=setup('false');
 assert.equal((await disabled.handler(request(),params)).status,404);
 assert.equal(disabled.forwarded.length,0);
});
