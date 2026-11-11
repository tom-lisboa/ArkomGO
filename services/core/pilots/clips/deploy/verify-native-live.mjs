// Uses the explicitly requested test account. Password is supplied only in memory.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
import { createHash } from "node:crypto";

const root=resolve(import.meta.dirname,"../../..");
const profile=JSON.parse(await readFile(join(root,".local/clips-native/provisioned.json"),"utf8"));
assert(profile.auth_provider==="local"&&process.env.CLIPS_NATIVE_TEST_PASSWORD);
const {chromium}=createRequire(join(root,".local/arkom-clips-go-interface/package.json"))("playwright");
const cache=join(homedir(),"Library/Caches/ms-playwright");
const version=readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort((a,b)=>Number(b.split('-').at(-1))-Number(a.split('-').at(-1)))[0];
const executablePath=process.env.CLIPS_TEST_CHROMIUM||join(cache,version,"chrome-headless-shell-mac-arm64/chrome-headless-shell");
const base="https://clipsgo-homolog.24-199-100-186.sslip.io";
const browser=await chromium.launch({headless:true,executablePath});
const state=join(root,".local/clips-native");await mkdir(state,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:980},acceptDownloads:true,serviceWorkers:"block"});
 const externalAuth=[];
 await context.route("**/*",route=>{const u=new URL(route.request().url());if(u.hostname.endsWith("supabase.co")){externalAuth.push(u.pathname);return route.abort()};return route.continue()});
 const page=await context.newPage();
 await page.goto(base+"/login");await page.locator("#email").fill(profile.email);await page.locator("#password").fill(process.env.CLIPS_NATIVE_TEST_PASSWORD);
 const loginResponse=page.waitForResponse(r=>r.url()===base+"/auth/login");
 await page.getByRole("button",{name:"Entrar",exact:true}).click();
 let response=await loginResponse;
 if(response.status()===429){await new Promise(resolve=>setTimeout(resolve,6100));const retry=page.waitForResponse(r=>r.url()===base+"/auth/login");await page.getByRole("button",{name:"Entrar",exact:true}).click();response=await retry}
 assert.equal(response.status(),200,"Native login was not accepted");
 await page.waitForURL(base+"/dashboard");await page.reload();await page.getByRole("heading",{name:"Meus Vídeos",exact:true}).waitFor();
 const identity=await page.evaluate(()=>fetch("/auth/me").then(r=>r.json()));
 assert.equal(identity.id,profile.id);assert.equal(identity.organization_id,profile.organization_id);assert.equal(identity.auth_provider,"local");
 assert.equal(await page.evaluate(()=>fetch("/ops/status").then(r=>r.status)),401);
 assert.equal(await page.evaluate(()=>fetch("/integration/v1/events?source=clips").then(r=>r.status)),401);
 const cookie=(await context.cookies()).find(c=>c.name==="__Host-clips_go_auth");assert(cookie.secure&&cookie.httpOnly&&cookie.sameSite==="Strict");
 await page.getByRole("link",{name:"Novo vídeo",exact:true}).first().click();await page.locator("#title").fill("Teste de integração · Bilhon · vídeo fictício");
 await page.locator('input[type="file"]').setInputFiles(join(root,".local/clips-pilot-video/fixture.mp4"));
 await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Enviar e gerar corte")&&!b.disabled));
 await page.getByRole("button",{name:"Enviar e gerar corte",exact:true}).click();await page.waitForURL(/\/project\//);
 const project=new URL(page.url()).pathname.split('/').at(-1);
 await page.getByRole("button",{name:"Exportar",exact:true}).first().waitFor({timeout:120000});
 const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar",exact:true}).first().click();const download=await downloadPromise;
 await download.saveAs(join(state,"integration-export.mp4"));
 const mp4=await readFile(join(state,"integration-export.mp4"));assert.equal(mp4.subarray(4,8).toString(),"ftyp");
 let deliveries=[];
 for(let i=0;i<30;i++){
   const result=await page.evaluate(()=>fetch("/app/integrations").then(r=>r.json()));
   deliveries=(result.deliveries||[]).filter(d=>d.project_id===project);
   if(deliveries.length===3)break;
   await new Promise(resolve=>setTimeout(resolve,2000));
 }
 assert.equal(deliveries.length,3,"The three connectors did not record delivery");
 assert.equal(deliveries.find(d=>d.destination==="social").state,"draft");
 assert.equal(deliveries.find(d=>d.destination==="finance").state,"received");
 assert.equal(deliveries.find(d=>d.destination==="bia-sdr").state,"received");
 await page.screenshot({path:join(state,"account-verified.png"),fullPage:true,animations:"disabled"});
 assert.deepEqual(externalAuth,[]);
 await writeFile(join(state,"live-flow.json"),JSON.stringify({email:profile.email,organization_id:profile.organization_id,account_id:profile.id,
   project_id:project,source_event_id:"clips-export-"+project,video_sha256:createHash("sha256").update(mp4).digest("hex"),native_login:true,
   reload:true,supabase_requests:0,member_not_operator:true,secure_cookie:true,deliveries,external_publication:false,financial_command:false,customer_message:false},null,2));
 await page.getByRole("button",{name:"Sair",exact:true}).click();await page.waitForURL(base+"/login");
 assert.equal(await page.evaluate(()=>fetch("/auth/me").then(r=>r.status)),401);
 console.log("Requested native account verified: login, reload, real MP4, three durable connector receipts and logout; no Supabase request.");
}finally{await browser.close()}
