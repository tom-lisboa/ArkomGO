const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../web/bridge.js'),'utf8');
const tick=()=>new Promise(setImmediate);
function harness({role='admin',status='ready',view='',handle=async()=>({status:200,body:'{}',content_type:'application/json'})}={}){
 let receive,call;const calls=[],events=[],states=new Map();let starts=0;
 const parent={postMessage(){}};
 const global={document:{},parent,location:{origin:'http://localhost:3007',search:'?view='+encodeURIComponent(view)},AbortController,AbortSignal,TextDecoder,URL,
  setTimeout:(fn,ms)=>ms===400?setTimeout(fn,0):0,clearTimeout,
  addEventListener:(name,fn)=>{if(name==='message')receive=fn;},
  genesisPreview:{createPreview:(_files,fn)=>{call=fn;return {}; }},
  fetch:async(url,options)=>{
   const id=url.split('/construction/')[1]?.split('/')[0];calls.push({url,options,id});
   if(url.includes('/events?')){let sent=false;const build={id,sequence:0,status,contract_status:'validated',runtime_compatible:true};
    return {ok:true,headers:{get:()=> 'text/event-stream'},body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:new TextEncoder().encode('event: snapshot\ndata: '+JSON.stringify({build})+'\n\nevent: end\ndata: {}\n\n')})})}};
   }
   let result;
   if(url.endsWith('/start')){starts++;states.set(id,'starting');result={status:'starting'};}
   else if(url.endsWith('/stop')){states.set(id,'stopped');result={status:'stopped'};}
   else if(url.endsWith('/runtime')){result={status:states.get(id)||'stopped'};if(result.status==='starting')states.set(id,'running');}
   else if(url.endsWith('/request')){
    if(states.get(id)!=='running')return {ok:false,status:409,json:async()=>({error:'runtime_not_running'})};
    result=await handle(JSON.parse(options.body));
    if(result.error)return {ok:false,status:502,json:async()=>result};
   }else result={builds:[]};
   return {ok:true,status:url.endsWith('/start')?202:200,json:async()=>result};
  }};
 vm.runInNewContext(source,global);
 global.genesisBridge.connect(raw=>events.push(JSON.parse(raw)));
 receive({origin:global.location.origin,source:parent,data:{type:'arkom.genesis.session',session:{access_token:'test-only',identity:{role}}}});
 return {calls,events,states,get starts(){return starts;},
  select:async id=>{await global.genesisBridge.invoke('select',JSON.stringify({id}));await tick();},
  preview:()=>{global.genesisBridge.createPreview('{}');return call;},
  invoke:(action,id)=>global.genesisBridge.invoke(action,JSON.stringify({id})),
  close:()=>global.genesisBridge.disconnect()};
}
test('ready solution connects automatically; simultaneous reads wait for Go and execute in order',async()=>{
 let active=0,maxActive=0;const paths=[];
 const h=harness({handle:async data=>{maxActive=Math.max(maxActive,++active);paths.push(data.path);await tick();active--;return {status:200,body:data.path};}});
 try{await h.select('app');const call=h.preview();
  const replies=await Promise.all([call({method:'GET',path:'/api/a',body:''}),call({method:'GET',path:'/api/b',body:''})]);
  assert.equal(h.starts,1);assert.equal(maxActive,1);assert.deepEqual(paths,['/api/a','/api/b']);assert.equal(replies[1].body,'/api/b');
  assert.ok(h.events.some(e=>e.type==='runtime'&&e.status==='starting'));
  assert.ok(h.events.some(e=>e.type==='runtime'&&e.status==='running'));
 }finally{h.close();}
});
test('expired runtime reconnects before retry, explicit pause stays paused, and ambiguous writes are not replayed',async()=>{
 let writes=0;const h=harness({handle:async data=>{if(data.method==='POST'){writes++;return {error:'runtime_request_failed'};}return {status:200,body:'[]'};}});
 try{await h.select('app');const call=h.preview();await call({method:'GET',path:'/api/a',body:''});
  h.states.set('app','stopped');await call({method:'GET',path:'/api/a',body:''});assert.equal(h.starts,2);
  await assert.rejects(()=>call({method:'POST',path:'/api/a',body:'{}'}));assert.equal(writes,1);
  await h.invoke('runtime_stop','app');await assert.rejects(()=>call({method:'GET',path:'/api/a',body:''}),/pausada/);assert.equal(h.starts,2);
  await h.invoke('runtime_start','app');await call({method:'GET',path:'/api/a',body:''});assert.equal(h.starts,3);
 }finally{h.close();}
});
test('switching solutions releases this studio runtime and rejects the previous frame',async()=>{
 const h=harness();try{await h.select('first');const first=h.preview();await first({method:'GET',path:'/api/a',body:''});
  await h.select('second');const second=h.preview();await second({method:'GET',path:'/api/a',body:''});
  assert.equal(h.states.get('first'),'stopped');assert.equal(h.states.get('second'),'running');
  await assert.rejects(()=>first({method:'POST',path:'/api/a',body:'{}'}),/encerrada/);
 }finally{h.close();}
});
test('unfinished solutions and viewer sessions never start a backend',async()=>{
 for(const options of [{status:'awaiting_step'},{role:'viewer'}]){
  const h=harness(options);try{await h.select('app');await assert.rejects(()=>h.preview()({method:'GET',path:'/api/a',body:''}),/Conclua/);assert.equal(h.starts,0);}finally{h.close();}
 }
});

test('a tool shuts down its own backend when the user returns to the workspace',async()=>{
 const h=harness({view:'tools/build_example'});
 await h.select('build_example');
 await h.preview()({method:'GET',path:'/api/a',body:''});
 h.close();
 assert.equal(h.states.get('build_example'),'stopped');
 assert.ok(h.calls.some(r=>r.url.endsWith('/runtime/stop')&&r.options.keepalive));
});
