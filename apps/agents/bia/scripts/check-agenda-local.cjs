// Uses only the two explicit local demo tenants. Never connects Google or WhatsApp.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),base='http://127.0.0.1:3007';
const prefix='/api/demo/backend/v1/sdr/calendar';
const fixtureName='Lia · Teste local ArkomGO';
(async()=>{
 const browser=await chromium.launch({headless:true});
 let context,page,identity,calendar;
 const output=path.join(root,'.local/ui-review');fs.mkdirSync(output,{recursive:true});
 async function api(session,route,body){
  const r=await page.request.fetch(base+prefix+route,{method:body===undefined?'GET':'POST',
   headers:{Authorization:'Bearer '+session.access_token,...(body===undefined?{}:{'Idempotency-Key':crypto.randomUUID()})},data:body});
  if(!r.ok())throw Error('Agenda '+route+': HTTP '+r.status());
  return r.json();
 }
 async function currentCalendar(){return (await api(identity,'/calendars')).items.find(c=>c.id===calendar.id)}
 async function waitJob(id){
  for(let n=0;n<60;n++){
   const value=await api(identity,'/requests/'+id);
   if(!['queued','running'].includes(value.status))return value;
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Worker calendar did not finish the request');
 }
 try{
  context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Cuiaba'});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const entered=page.waitForResponse(r=>r.url().endsWith('/__test/ui/local-enter'));
  await page.goto(base+'/demo');const response=await entered;
  if(!response.ok())throw Error('Local demo entry: HTTP '+response.status());
  identity=await response.json();assert.equal(identity.identity.organization_id,'org_demo_alfa');
  await page.waitForSelector('flutter-view',{state:'attached'});
  await page.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
  await page.getByRole('button',{name:'Lia',exact:true}).click();
  const frame=page.frameLocator('iframe[data-arkom-agent="agenda"]');
  await expect(frame.getByRole('heading',{name:'Sua agenda, organizada.'})).toBeVisible();
  await expect(frame.getByRole('button',{name:'Entrar com Google',exact:true})).toBeDisabled();
  const existing=(await api(identity,'/calendars')).items.find(c=>c.name===fixtureName);
  if(existing){
   calendar=existing;
   await api(identity,'/calendars/'+calendar.id,{name:calendar.name,enabled:true,expected_revision:calendar.revision,policy:{...calendar.policy,require_approval:true},agents:{}});
   await frame.getByRole('button',{name:'Atualizar',exact:true}).click();
  }else{
   await frame.getByLabel('Nome',{exact:true}).fill(fixtureName);
   await frame.getByRole('button',{name:'Salvar agenda e regras',exact:true}).click();
   await expect(frame.getByLabel(fixtureName,{exact:true})).toBeVisible();
   calendar=(await api(identity,'/calendars')).items.find(c=>c.name===fixtureName);
  }
  assert(calendar);assert.equal(calendar.organization_id,identity.identity.organization_id);
  await frame.getByLabel(fixtureName,{exact:true}).check();
  const day=new Date();day.setDate(day.getDate()+2);while([0,6].includes(day.getDay()))day.setDate(day.getDate()+1);
  const date=day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0');
  await frame.getByLabel('A partir de',{exact:true}).fill(date+'T09:00');
  await frame.getByLabel('Até',{exact:true}).fill(date+'T12:00');
  await frame.getByLabel('Nome do atendimento',{exact:true}).fill('Atendimento fictício ArkomGO');
  async function chooseSlot(index=0){
   await frame.getByRole('button',{name:'Consultar disponibilidade',exact:true}).click();
   const slot=frame.getByRole('button').filter({hasText:fixtureName}).nth(index);
   await expect(slot).toBeVisible({timeout:20000});await slot.click();
   await expect(frame.getByRole('button',{name:'Aprovar',exact:true})).toBeVisible();
  }
  await chooseSlot();
  assert.equal((await api(identity,'/bookings')).items.filter(b=>b.calendar_id===calendar.id&&b.status==='confirmed').length,0);
  await frame.getByRole('button',{name:'Aprovar',exact:true}).click();
  await expect(frame.getByText(fixtureName+' · Confirmado',{exact:true})).toBeVisible({timeout:20000});
  let booking=(await api(identity,'/bookings')).items.find(b=>b.calendar_id===calendar.id&&b.status==='confirmed');
  assert(booking);const firstTime=booking.event.start;
  await frame.getByRole('button',{name:'Remarcar',exact:true}).click();
  await chooseSlot(1);
  assert.equal((await api(identity,'/bookings')).items.find(b=>b.id===booking.id).event.start,firstTime);
  await frame.getByRole('button',{name:'Aprovar',exact:true}).click();
  await expect(frame.getByRole('heading',{name:'Consultar horários',exact:true})).toBeVisible({timeout:20000});
  booking=(await api(identity,'/bookings')).items.find(b=>b.id===booking.id);
  assert.notEqual(booking.event.start,firstTime);assert.equal(booking.event.summary,'Atendimento fictício ArkomGO');
  await frame.getByRole('button',{name:'Solicitar cancelamento',exact:true}).click();
  await frame.getByRole('button',{name:'Aprovar',exact:true}).click();
  await expect(frame.locator('.core-item').filter({hasText:fixtureName}).getByRole('button',{name:'Solicitar cancelamento',exact:true})).toHaveCount(0,{timeout:20000});
  assert.equal((await api(identity,'/bookings')).items.find(b=>b.id===booking.id).status,'cancelled');
  await expect(frame.getByText(fixtureName+' · Cancelado',{exact:true}).first()).toBeVisible();
  await frame.locator('body').evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(output,'lia-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,'lia-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'BIA SDR',exact:true}).click();
  const bia=page.frameLocator('iframe[data-arkom-agent="sdr"]');
  await bia.getByRole('button',{name:'Agendas',exact:true}).click();
  await expect(bia.getByLabel(fixtureName,{exact:true})).toBeVisible();
  // The Beta session is created with its own private local access code, never reused from Alfa.
  const codes=JSON.parse(fs.readFileSync(path.join(root,'.local/runtime/lab-data/credentials.json'),'utf8'));
  const betaContext=await browser.newContext({viewport:{width:1280,height:900}}),betaPage=await betaContext.newPage();let beta;
  await betaPage.route('**/api/demo/backend/__test/ui/local-enter',async route=>{
   const reply=await route.fetch({url:base+'/api/demo/backend/__test/ui/login',method:'POST',postData:JSON.stringify({company:'beta',role:'admin',access_code:codes['beta.admin']}),headers:{'Content-Type':'application/json'}});
   if(reply.ok())beta=await reply.json();await route.fulfill({response:reply});
  });
  await betaPage.goto(base+'/demo/agenda');await betaPage.waitForSelector('flutter-view',{state:'attached'});
  await betaPage.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
  const betaFrame=betaPage.frameLocator('iframe[data-arkom-agent="agenda"]');
  await expect(betaFrame.getByRole('heading',{name:'Sua agenda, organizada.'})).toBeVisible();
  assert.equal(beta.identity.organization_id,'org_demo_beta');
  assert.equal((await api(beta,'/calendars')).items.some(c=>c.id===calendar.id),false);
  assert.equal((await api(beta,'/bookings')).items.some(b=>b.id===booking.id),false);
  const ownRequest=(await api(identity,'/requests')).items.find(j=>j.input.booking_id===booking.id);
  assert(ownRequest);
  const foreign=await betaPage.request.get(base+prefix+'/requests/'+ownRequest.id,{headers:{Authorization:'Bearer '+beta.access_token}});
  assert.equal(foreign.status(),404);
  await expect(betaFrame.getByText(fixtureName,{exact:true})).toHaveCount(0);
  await betaContext.close();assert.deepEqual(errors,[]);
  console.log('PASS: Lia creates a local agenda, consults slots, approves booking/rescheduling/cancellation, renders on mobile, and isolates Alfa/Beta. Google stays blocked.');
 }finally{
  try {
   if(identity&&calendar){
    for(const booking of (await api(identity,'/bookings')).items.filter(b=>b.calendar_id===calendar.id&&b.status==='confirmed')){
     let job=await api(identity,'/requests',{kind:'cancel',booking_id:booking.id,expected_revision:booking.revision});
     if(job.status==='waiting_approval')job=await api(identity,'/requests/'+job.id+'/actions',{action:'approve'});
     await waitJob(job.id);
    }
    const c=await currentCalendar();await api(identity,'/calendars/'+c.id,{name:c.name,enabled:false,expected_revision:c.revision,policy:c.policy,agents:c.agents});
   }
  }finally{await browser.close()}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
