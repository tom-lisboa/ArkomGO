const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('src/app/api/demo/backend/[...path]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(enabled='true'){
 const exports={},forwarded=[];
 vm.runInNewContext(source,{exports,URL,Response,Headers,process:{env:{ARKOM_LOCAL_DEMO:enabled}},fetch:async(url,options)=>{forwarded.push({url,options});return Response.json({ok:true})}});
 return {handler:exports.POST,get:exports.GET,forwarded};
}
function request(origin='http://127.0.0.1:3007'){
 // Reproduce Next's normalized URL while preserving the incoming Host.
 return {method:'POST',nextUrl:new URL('http://localhost:3007/api/demo/backend/__test/ui/local-enter'),headers:new Headers({host:'127.0.0.1:3007',origin,'content-type':'application/json'}),arrayBuffer:async()=>new TextEncoder().encode('{}').buffer};
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

test('event proxy forwards replay cursor and abort signal without buffering',async()=>{
 const {get,forwarded}=setup();const abort=new AbortController();
 const req={method:'GET',nextUrl:new URL('http://127.0.0.1:3007/api/demo/backend/v1/sdr/genesis-demo/construction/build/events?after=3'),headers:new Headers({'last-event-id':'3',authorization:'Bearer fixture'}),signal:abort.signal};
 const r=await get(req,{params:Promise.resolve({path:['v1','sdr','genesis-demo','construction','build','events']})});
 assert.equal(forwarded[0].options.signal,abort.signal);assert.equal(forwarded[0].options.headers.get('last-event-id'),'3');assert.equal(r.headers.get('x-accel-buffering'),'no');assert.match(r.headers.get('cache-control'),/no-transform/);
});

test('multipart upload bytes reach the Go service unchanged',async()=>{
 const {handler,forwarded}=setup();const bytes=Uint8Array.from([0,255,128,13,10,65]);
 const req={...request(),arrayBuffer:async()=>bytes.buffer};req.headers.set('content-type','multipart/form-data; boundary=fixture');
 assert.equal((await handler(req,{params:Promise.resolve({path:['v1','sdr','genesis-demo','ecosystem','clips','jobs']})})).status,200);
 assert.deepEqual(Array.from(new Uint8Array(forwarded[0].options.body)),Array.from(bytes));
 assert.equal(forwarded[0].options.headers.get('content-type'),'multipart/form-data; boundary=fixture');
});
