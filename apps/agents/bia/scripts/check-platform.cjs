/* Local smoke: no new messages, customers, invoices, builds or charges are created. */
const {chromium,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const output=path.resolve(__dirname,'../../../../.local/ui-review');fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],documents=[],missing=[];
  async function tapCanvasButton(name) {
   const target=page.getByRole('button',{name,exact:true});
   await expect(target).toBeVisible();
   const box=await target.boundingBox();
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  }
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()===404&&r.url().includes('/agents/bia/'))missing.push(r.url())});
  page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents.push(r.url())});
  const entering=page.waitForResponse(r=>r.url().endsWith('/__test/ui/local-enter'));
  await page.goto('http://127.0.0.1:3007/demo');
  const entrance=await entering;
  if(!entrance.ok())throw Error(`Local demo entry: HTTP ${entrance.status()}${entrance.headers()['retry-after'] ? ` (retry after ${entrance.headers()['retry-after']} s)` : ''}`);
  await page.waitForSelector('flutter-view',{state:'attached'});
  await page.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeVisible();
  await expect(page.getByText('Alfa · Demonstração',{exact:true})).toBeVisible();
  await page.evaluate(()=>document.querySelector('flutter-view').dataset.smoke='same-engine');
  await page.screenshot({path:path.join(output,'platform-home.png')});
  await page.getByRole('button',{name:/^Arkom · Visão geral/}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3007/demo/home');
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3007/demo');
  await page.getByRole('button',{name:'BIA SDR',exact:true}).click();
  const selector='iframe[data-arkom-agent="sdr"]';
  await expect(page.locator(selector)).toBeVisible({timeout:25000});
  const bia=page.frameLocator(selector);
  await expect(bia.getByRole('button',{name:'Agendas',exact:true})).toBeEnabled();
  await bia.getByRole('button',{name:'Álbuns',exact:true}).click();
  await expect(bia.getByRole('heading',{name:/Álbum de projetos/})).toBeVisible();
  await page.evaluate(()=>document.querySelector('iframe[data-arkom-agent="sdr"]').contentWindow.document.documentElement.dataset.smoke='same-agent');
  await page.getByRole('button',{name:'Ferramentas',exact:true}).click();
  await expect(page.locator(selector)).toBeHidden();
  await page.getByRole('button',{name:'BIA SDR',exact:true}).click();
  await expect(page.locator(selector)).toBeVisible();
  if(await bia.locator('html').getAttribute('data-smoke')!=='same-agent')throw Error('BIA reloaded during navigation');
  await expect(bia.getByRole('heading',{name:/Álbum de projetos/})).toBeVisible();
  await page.getByRole('button',{name:'Genesis',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3007/demo/genesis');
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeVisible();
  await page.evaluate(()=>globalThis.genesisBridge.invoke('navigate','{"view":"team"}'));
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeVisible();
  for(const [id,title] of [['agenda','Lia'],['multipropriedades','Maia'],['financeai','FinanceAI']]){
   await page.getByRole('button',{name:title,exact:true}).click();
   await expect(page.locator(`iframe[data-arkom-agent="${id}"]`)).toBeVisible({timeout:30000});
   console.log(title+': opened');
  }
  await page.getByRole('button',{name:'BIA SDR',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(250);
  const bounds=await page.locator(selector).boundingBox();
  if(bounds.x<70||bounds.x+bounds.width>391)throw Error('Mobile agent outside content bounds');
  const overflow=await bia.locator('body').evaluate(el=>el.scrollWidth>innerWidth);
  if(overflow)throw Error('BIA mobile horizontal overflow');
  await page.screenshot({path:path.join(output,'platform-bia-mobile.png')});
  if(await page.locator('flutter-view').getAttribute('data-smoke')!=='same-engine')throw Error('Flutter engine recreated');
  await page.mouse.move(385,12);
  await page.waitForTimeout(350);
  await tapCanvasButton('Recolher menu Arkom');
  await expect(page.getByRole('button',{name:'Mostrar menu Arkom',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeHidden();
  if(await page.evaluate(()=>localStorage.getItem('arkom.ui.navigation.collapsed'))!=='true')throw Error('Menu preference was not saved');
  await tapCanvasButton('Mostrar menu Arkom');
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeVisible();
  if(documents.length!==1)throw Error('Platform document navigation: '+documents.length);
  if(errors.length)throw Error(errors.join('\n'));
  if(missing.length)throw Error('Missing agent assets: '+missing.join(', '));
  await tapCanvasButton('Recolher menu Arkom');
  await page.reload();
  await page.waitForSelector('flutter-view',{state:'attached'});
  await page.evaluate(()=>document.querySelector('flt-semantics-placeholder')?.click());
  await expect(page.getByRole('button',{name:'Mostrar menu Arkom',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeHidden();
  await page.screenshot({path:path.join(output,'platform-menu-collapsed.png')});
  await tapCanvasButton('Mostrar menu Arkom');
  await expect(page.getByRole('button',{name:'Início',exact:true})).toBeVisible();
  console.log('PASS: Início/logo, cached BIA albums, Genesis, Maia, FinanceAI, mobile bounds, persistent collapse/reopen; navigation retains the Flutter engine.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
