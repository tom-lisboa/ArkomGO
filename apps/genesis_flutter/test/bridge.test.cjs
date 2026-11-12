const {test}=require('node:test');const assert=require('node:assert/strict');const {SSEParser}=require('../web/bridge.js');
test('stream parser handles split lines, heartbeats and multiple frames',()=>{const frames=[];const parser=new SSEParser(e=>frames.push(e));const wire=': heartbeat\r\n\r\nid: 3\r\nevent: update\r\ndata: {"summary":"Construção"}\r\n\r\nid: 4\nevent: end\ndata: {}\n\n';for(const char of wire)parser.feed(char);assert.deepEqual(frames,[{event:'update',id:'3',data:'{"summary":"Construção"}'},{event:'end',id:'4',data:'{}'}]);});
test('incomplete event is retained until its terminating blank line',()=>{const frames=[];const parser=new SSEParser(e=>frames.push(e));parser.feed('event: update\ndata: {"a":1}\n');assert.equal(frames.length,0);parser.feed('\n');assert.equal(frames.length,1);});
const vm=require('node:vm'),fs=require('node:fs');
test('session bridge accepts only parent + same origin and keeps token out of URL/storage',async()=>{
 let listener;const delivered=[],requests=[],parent={postMessage(){}};
 const global={document:{},parent,location:{origin:'http://localhost:3007'},addEventListener:(name,cb)=>{if(name==='message')listener=cb},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({builds:[]})}},AbortController,AbortSignal,TextDecoder,URL,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/bridge.js'),'utf8'),global);
 global.genesisBridge.connect(raw=>delivered.push(JSON.parse(raw)));
 const data={type:'arkom.genesis.session',session:{access_token:'test-only-session',identity:{role:'admin',organization_id:'a'}}};
 listener({origin:'https://wrong.example',source:parent,data});listener({origin:global.location.origin,source:{},data});assert.equal(delivered.length,0);
 listener({origin:global.location.origin,source:parent,data});assert.equal(delivered.length,1);
 await global.genesisBridge.invoke('list','{}');assert.equal(requests[0].options.headers.Authorization,'Bearer test-only-session');assert.ok(!requests[0].url.includes('test-only-session'));
 global.genesisBridge.disconnect();await assert.rejects(()=>global.genesisBridge.invoke('list','{}'));
});
