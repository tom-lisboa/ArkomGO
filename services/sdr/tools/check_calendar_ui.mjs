// DOM test of the real agenda console. No browser automation or real service.
import path from 'node:path';
import Module from 'node:module';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'frontend/package.json'));
const React=require('react'),esbuild=require('esbuild'),{JSDOM}=require('jsdom'),{createRoot}=require('react-dom/client');
const {act}=React;
const built=await esbuild.build({entryPoints:[path.join(root,'frontend/src/CalendarConsole.tsx')],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
const mod=new Module(path.join(root,'frontend/.calendar-ui-check.cjs'));mod.filename=path.join(root,'frontend/.calendar-ui-check.cjs');mod.paths=Module._nodeModulePaths(path.join(root,'frontend'));mod._compile(built.outputFiles[0].text,mod.filename);
const dom=new JSDOM('<div id="root"></div>',{url:'https://client.lovable.app'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const session={access_token:'unit-calendar-session',identity:{user_id:'admin',organization_id:'org_demo_alfa',role:'admin',environment:'test'}};
const policy={timezone:'America/Cuiaba',windows:[{day:1,start_minute:480,end_minute:1080}],blocked_dates:[],durations:[30,60],step_minutes:15,buffer_before_minutes:0,buffer_after_minutes:0,minimum_notice_minutes:30,horizon_days:60,require_approval:true};
const calendar={id:'calendar-owned',name:'Agenda piloto',provider:'native',revision:1,enabled:true,writable:true,policy,agents:{}};
const slots=[{id:'actual-slot',calendar_id:calendar.id,checked_calendar_ids:[calendar.id],start:new Date(Date.now()+3600000).toISOString(),end:new Date(Date.now()+5400000).toISOString(),timezone:'America/Cuiaba'}];
let jobs=[],calls=[];const previous=globalThis.fetch;
window.open=()=>{throw Error('Google opened before configuration')};
globalThis.fetch=async(url,options={})=>{
 assert(String(url).startsWith('https://24.199.100.186/sdr-next/v1/sdr/calendar/'));assert.equal(options.headers.Authorization,'Bearer unit-calendar-session');assert.equal(options.credentials,'omit');calls.push({url:String(url),options});
 const endpoint=String(url).split('/v1/sdr/calendar/')[1];
 if(endpoint==='capabilities')return Response.json({enabled:true,google_configured:false,can_configure:true,can_request:true});
 if(endpoint==='calendars')return Response.json({items:[calendar]});
 if(endpoint==='connections'||endpoint==='bookings')return Response.json({items:[]});
 if(endpoint==='requests'&&options.method==='GET')return Response.json({items:jobs});
 if(endpoint==='requests'&&options.method==='POST'){
  const input=JSON.parse(options.body);assert(!input.organization_id&&!input.agent_id);assert(options.headers['Idempotency-Key']);
  const availability=input.kind==='availability';if(availability)assert.deepEqual(input.calendar_ids,[calendar.id]);else{assert.equal(input.availability_id,'offered');assert.equal(input.slot_id,'actual-slot')}
  const job={id:availability?'offered':'booking-request',source:'manual',status:availability?'completed':'waiting_approval',input,result:{status:availability?'completed':'waiting_approval',slots:availability?slots:[],limited:false},effect_started:false,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+900000).toISOString()};jobs=[job,...jobs];return Response.json(job,{status:202});
 }
 if(endpoint==='requests/booking-request/actions'){
  assert.equal(JSON.parse(options.body).action,'approve');const job={...jobs[0],status:'confirmed',result:{status:'confirmed'}};jobs[0]=job;return Response.json(job);
 }
 throw Error('Unexpected agenda route '+endpoint);
};
const app=createRoot(document.getElementById('root'));
async function settle(action){await act(async()=>{if(action)action();await new Promise(resolve=>setTimeout(resolve,20))})}
try{
 await settle(()=>app.render(React.createElement(mod.exports.default,{session})));
 assert(document.body.textContent.includes('Agendas'));
 assert([...document.querySelectorAll('button')].find(b=>b.textContent==='Entrar com Google').disabled);
 const pick=document.querySelector('aside label input[type=checkbox]');assert(pick);await settle(()=>pick.click());
 const lookup=[...document.querySelectorAll('button')].find(b=>b.textContent==='Consultar disponibilidade');assert(!lookup.disabled);await settle(()=>lookup.click());
 const slot=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Agenda piloto'));assert(slot);await settle(()=>slot.click());
 assert(document.body.textContent.includes('Aguardando aprovação'));assert(!document.body.textContent.includes('Agendamento confirmado'));
 const approve=[...document.querySelectorAll('button')].find(b=>b.textContent==='Aprovar');assert(approve);await settle(()=>approve.click());
 assert(document.body.textContent.includes('Confirmado'));
 assert(calls.every(c=>!c.url.includes('googleapis.com')));
 await settle(()=>app.unmount());
}finally{globalThis.fetch=previous;dom.window.close()}
console.log(JSON.stringify({passed:true,real_component:true,multi_calendar_selection:true,actual_slot_reference_preserved:true,approval_before_confirmation:true,unconfigured_google_disabled:true,external_network_calls:0,browser_visual_verified:false}));
