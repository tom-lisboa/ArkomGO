// Read-only verification of the published interface, TLS and private API boundary.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const checkout = join(root, ".local/arkom-clips-go-interface");
const { chromium } = createRequire(join(checkout, "package.json"))("playwright");
const cache = join(homedir(), "Library/Caches/ms-playwright");
const cached = existsSync(cache) ? readdirSync(cache).filter(n=>/^chromium_headless_shell-\d+$/.test(n)).sort((a,b)=>Number(b.split('-').at(-1))-Number(a.split('-').at(-1)))[0] : null;
const executablePath = process.env.CLIPS_TEST_CHROMIUM || (cached ? join(cache,cached,"chrome-headless-shell-mac-arm64/chrome-headless-shell") : undefined);
const base = "https://clipsgo-homolog.24-199-100-186.sslip.io";
const browser = await chromium.launch({ headless:true,...(executablePath?{executablePath}:{}) });
try {
  const context = await browser.newContext({ viewport:{width:1440,height:980}, serviceWorkers:"block" });
  const paths=[];
  const page=await context.newPage();
  page.on("request",request=>{
    const url=new URL(request.url());
    if(url.hostname.endsWith("supabase.co"))paths.push(url.pathname);
  });
  const response=await page.goto(base+"/login");
  assert.equal(response.status(),200);
  assert((await response.allHeaders())["content-security-policy"].includes("frame-ancestors 'none'"));
  await page.getByRole("heading",{name:"Entrar na conta",exact:true}).waitFor();
  await page.screenshot({path:join(root,".local/clips-deployment/interface-publicada.png"),fullPage:true,animations:"disabled"});
  const html=await response.text();
  const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const code=await context.request.get(base+asset);
  assert.equal(code.status(),200);
  const js=await code.text();
  assert(js.includes("auytmefqnuzbktyzcled.supabase.co") && !js.includes("http://127.0.0.1:18089"));
  await page.goto(base+"/dashboard");
  await page.waitForURL(base+"/login");
  for(const path of ["/auth/me","/rest/v1/projects","/storage/v1/object/sign/clips-videos/source/unknown.mp4","/ops/status"]){
    const result=await context.request.get(base+path);assert.equal(result.status(),401,path);
  }
  const denied=await context.request.post(base+"/app/projects",{data:{}});assert.equal(denied.status(),401);
  assert.equal((await context.request.get(base+"/healthz")).status(),200);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(root,".local/clips-deployment/interface-mobile.png"),fullPage:true,animations:"disabled"});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(paths,[]);
  const release=JSON.parse(await readFile(join(root,".local/clips-deployment/release.json"),"utf8"));
  await writeFile(join(root,".local/clips-deployment/interface-publicada.json"),JSON.stringify({
    url:base+"/login",release:release.release,tls_verified:true,official_login_rendered:true,
    anonymous_dashboard_redirected:true,anonymous_data_access_denied:true,production_data_requests:0,
    mobile_without_overflow:true,customer_login_tested:false,
  },null,2));
  console.log("Published official UI, valid TLS, protected data and mobile login verified.");
} finally {await browser.close();}
