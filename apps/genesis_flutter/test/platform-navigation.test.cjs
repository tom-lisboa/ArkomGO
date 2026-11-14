const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const tick=()=>new Promise(setImmediate);

function harness({standalone=true,handle}={}){
 const listeners={},frames=[],requests=[],navigated=[];
 const location={origin:'http://127.0.0.1:3007',href:'http://127.0.0.1:3007/demo',pathname:'/demo',search:''};
 const global={location,URL,AbortController,AbortSignal,TextDecoder,
  setTimeout:()=>1,clearTimeout(){},
  addEventListener(type,fn){(listeners[type]??=[]).push(fn)},
  document:{body:{appendChild(frame){frames.push(frame)}},createElement(type){
   assert.equal(type,'iframe');const sent=[];
   return {style:{},dataset:{},setAttribute(){},remove(){this.removed=true},contentWindow:{sent,postMessage(data,origin){sent.push({data,origin})}}};
  }},
  history:{pushState(_state,_unused,path){navigated.push(path);const url=new URL(path,location.origin);Object.assign(location,{href:url.href,pathname:url.pathname,search:url.search})}},
  fetch:async(url,options)=>{
   requests.push({url,options});
   const result=handle?await handle(url,options):url.endsWith('/local-enter')?{access_token:'test-alfa',identity:{organization_id:'org_demo_alfa',role:'admin'}}:{builds:[]};
   return {ok:true,status:200,json:async()=>result};
  },
 };
 global.parent=standalone?global:{postMessage(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/agents.js'),'utf8'),global);
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/bridge.js'),'utf8'),global);
 return {global,frames,requests,navigated,
  message:async(source,origin,data)=>{await Promise.all((listeners.message||[]).map(fn=>fn({source,origin,data})));await tick()},
  pop:()=>{for(const fn of listeners.popstate||[])fn()},
  invoke:(action,data={})=>global.genesisBridge.invoke(action,JSON.stringify(data)),
  platform:fn=>global.genesisBridge.connectPlatform(raw=>fn(JSON.parse(raw))),
  studio:fn=>global.genesisBridge.connect(raw=>fn(JSON.parse(raw))),
 };
}

test('Flutter owns history and shares one in-memory session with Genesis across navigation',async()=>{
 const h=harness(),platform=[],studio=[];
 h.platform(e=>platform.push(e));h.studio(e=>studio.push(e));await tick();
 assert.equal(h.requests.length,1);assert.equal(platform.filter(e=>e.type==='session').length,1);assert.equal(studio.filter(e=>e.type==='session').length,1);
 await h.invoke('navigate',{view:'team'});await h.invoke('navigate',{view:'home'});
 assert.deepEqual(h.navigated,['/demo','/demo/home']);
 h.global.genesisBridge.disconnect();await h.invoke('platform',{path:'/v1/sdr/genesis-demo/ecosystem'});
 assert.equal(h.requests.at(-1).options.headers.Authorization,'Bearer test-alfa');
 h.studio(e=>studio.push(e));assert.equal(h.requests.filter(e=>e.url.endsWith('/local-enter')).length,1);
 Object.assign(h.global.location,{pathname:'/demo',href:h.global.location.origin+'/demo'});h.pop();assert.equal(platform.at(-1).view,'team');
 await assert.rejects(()=>h.invoke('navigate',{view:'https://attacker.example'}));
 assert.ok(!JSON.stringify(h.navigated).includes('test-alfa'));
});

test('BIA only receives the bound session after exact frame/origin handshake and retains its surface',async()=>{
 const h=harness();h.platform(()=>{});await tick();
 await h.invoke('agent_open',{id:'sdr',lease:'1'});const frame=h.frames[0],origin=h.global.location.origin;
 await h.message({},origin,{type:'arkom.bia.ready',requestId:'a'});
 await h.message(frame.contentWindow,'https://evil.example',{type:'arkom.bia.ready',requestId:'a'});
 assert.equal(frame.contentWindow.sent.length,0);
 await h.message(frame.contentWindow,origin,{type:'arkom.bia.ready',requestId:'valid'});
 assert.equal(frame.contentWindow.sent[0].data.session.access_token,'test-alfa');
 assert.equal(frame.src,'/agents/bia/');
 await h.message(frame.contentWindow,origin,{type:'arkom.bia.opened',requestId:'wrong'});
 assert.equal(frame.style.visibility,'hidden');
 await h.message(frame.contentWindow,origin,{type:'arkom.bia.opened',requestId:'valid'});
 assert.equal(frame.style.visibility,'visible');
 await h.invoke('agent_open',{id:'sdr',lease:'2'});await h.invoke('agent_close',{id:'sdr',lease:'1'});
 assert.equal(frame.style.display,'block');assert.equal(h.frames.length,1);
 await h.invoke('navigate',{view:'team'});assert.equal(frame.style.display,'none');
 await h.invoke('agent_open',{id:'sdr',lease:'3'});assert.equal(h.frames.length,1);assert.equal(frame.style.display,'block');
});

test('switching identity destroys agent surfaces and never gives an old frame the new tenant token',async()=>{
 const h=harness({standalone:false}),origin=h.global.location.origin;
 h.platform(()=>{});
 const session=token=>h.message(h.global.parent,origin,{type:'arkom.genesis.session',session:{access_token:token,identity:{organization_id:token,role:'admin'}}});
 await session('tenant-alpha');await h.invoke('agent_open',{id:'sdr',lease:'1'});const old=h.frames[0];
 await session('tenant-beta');assert.equal(old.removed,true);
 await h.message(old.contentWindow,origin,{type:'arkom.bia.ready',requestId:'stale'});assert.equal(old.contentWindow.sent.length,0);
 await h.invoke('agent_open',{id:'sdr',lease:'2'});const fresh=h.frames[1];
 await h.message(fresh.contentWindow,origin,{type:'arkom.bia.ready',requestId:'fresh'});
 assert.equal(fresh.contentWindow.sent[0].data.session.access_token,'tenant-beta');
});

test('Maia opens its Finance title and returns to the same preserved Maia surface',async()=>{
 const h=harness({handle:async(url,options)=>url.endsWith('/local-enter')?{access_token:'test-alfa',identity:{role:'admin'}}:url.includes('financeai')?{code:'single-use',state:JSON.parse(options.body).state}:{access_token:'maia-only',refresh_token:'private'}});
 const events=[];h.platform(e=>events.push(e));await tick();
 await h.invoke('agent_open',{id:'multipropriedades',lease:'1'});const maia=h.frames[0],multi='http://127.0.0.1:8180';
 await h.message(maia.contentWindow,multi,{type:'arkom.multi.ready',requestId:'maia-nonce'});
 await h.message(maia.contentWindow,multi,{type:'arkom.multi.opened',requestId:'maia-nonce'});
 await h.message(maia.contentWindow,multi,{type:'arkom.multi.finance',titleId:'title-42'});
 assert.equal(events.at(-1).view,'financeai');assert.equal(events.at(-1).returnTo,'multipropriedades');
 await h.invoke('agent_open',{id:'financeai',lease:'2'});const finance=h.frames[1];
 await h.message(finance.contentWindow,'http://127.0.0.1:8194',{type:'arkom.finance.ready',state:'nonce',challenge:'pkce'});
 assert.equal(finance.contentWindow.sent[0].data.titleId,'title-42');
 assert.equal(finance.contentWindow.sent[0].data.code,'single-use');
 await h.invoke('agent_return');
 assert.equal(events.at(-1).view,'multipropriedades');
 assert.equal(maia.removed,undefined);assert.equal(maia.contentWindow.sent.at(-1).data.type,'arkom.multi.finance-return');
});

test('only the menu preference is stored; session remains in memory',async()=>{
 const h=harness(),values=new Map();
 h.global.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 h.platform(()=>{});await tick();
 assert.equal(JSON.parse(await h.invoke('navigation_preference')).collapsed,false);
 await h.invoke('navigation_preference',{collapsed:true});
 assert.equal(JSON.parse(await h.invoke('navigation_preference')).collapsed,true);
 assert.deepEqual([...values.entries()],[['arkom.ui.navigation.collapsed','true']]);
 await h.invoke('navigation_preference',{collapsed:false});
 assert.equal(JSON.parse(await h.invoke('navigation_preference')).collapsed,false);
});
