import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

const checkout = resolve(process.argv[2]);
const ready = JSON.parse(await readFile(process.argv[3], "utf8"));
const root = resolve(checkout, "../.."), out = join(root, ".local/clips-remix-test");
await mkdir(out, { recursive: true });
const { chromium } = createRequire(join(checkout, "package.json"))("playwright");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cache=join(homedir(),"Library/Caches/ms-playwright");
const cached=existsSync(cache)?readdirSync(cache).filter(name=>/^chromium_headless_shell-\d+$/.test(name)).sort((a,b)=>Number(b.split('-').at(-1))-Number(a.split('-').at(-1)))[0]:null;
const executablePath=process.env.CLIPS_TEST_CHROMIUM||(existsSync(chrome)?chrome:cached?join(cache,cached,"chrome-headless-shell-mac-arm64/chrome-headless-shell"):undefined);
const browser = await chromium.launch({headless:true,args:["--host-resolver-rules=MAP *.localhost 127.0.0.1","--no-proxy-server"],...(executablePath?{executablePath}:{})});
const context = await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true,viewport:{width:1440,height:980}});
const faults = [], seen = [];
let access = "";

// All allowed hostnames resolve only to the private loopback TLS listener.
// Distinct sites exercise actual redirects, CORS and SameSite cookie behavior.
await context.route("**/*", async route => {
  const request=route.request(),url=new URL(request.url());
  if (["fonts.googleapis.com","fonts.gstatic.com"].includes(url.hostname)) return route.abort();
  if (!["clips.hub.localhost","alfa.remix.localhost","copied.remix.localhost"].includes(url.hostname)) {faults.push(url.origin+url.pathname);return route.abort();}
  seen.push({origin:url.origin,path:url.pathname,method:request.method()});
  const headers=await request.allHeaders();
  if(url.origin===ready.hub&&url.pathname==="/rest/v1/projects"&&headers.authorization?.startsWith("Bearer clips_remix_access_")) access=headers.authorization.slice(7);
  await route.continue();
});
try {
  const preview=await context.newPage();
  await preview.setContent(`<iframe title="Prévia do CLIPS" src="${ready.remix}/login"></iframe>`);
  await preview.frameLocator("iframe").getByRole("link",{name:"Abrir CLIPS",exact:true}).waitFor();
  await preview.close();
  const page=await context.newPage();page.on("pageerror",error=>faults.push(error.message));
  await page.goto(ready.remix+"/login");
  await page.waitForURL(ready.hub+"/login");
  await page.getByRole("heading",{name:"Entrar na conta"}).waitFor();
  await page.screenshot({path:join(out,"login-oficial.png"),fullPage:true});
  await page.locator("#email").fill("remix-test@bilhon.com");
  await page.locator("#password").fill(process.env.CLIPS_REMIX_TEST_PASSWORD);
  await page.getByRole("button",{name:"Entrar",exact:true}).click();
  await page.waitForURL(ready.remix+"/dashboard");
  await page.getByText("Nenhum vídeo ainda",{exact:true}).waitFor();
  assert(access,"scoped API credential was not used");
  assert.equal(new URL(page.url()).hash,"");
  assert.equal(await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>/clips_remix_(access|refresh)_/.test(value))),false,"tokens stored in browser storage");
  const check=await page.evaluate(async({api,id,token})=>{
    const headers={Authorization:"Bearer "+token,"X-Clips-Installation":id};
    return {foreign:await fetch(api+"/storage/v1/object/sign/clips-videos/source/FOREIGN-PROJECT.mp4",{headers,credentials:"omit"}).then(r=>r.status),technical:await fetch(api+"/ops/status",{headers,credentials:"omit"}).then(r=>r.status).catch(()=>403)};
  },{api:ready.hub,id:ready.installation.installation_id,token:access});
  assert.equal(check.foreign,404);assert.equal(check.technical,403);
  // A reload obtains a fresh entry through the existing official CLIPS login.
  await page.reload();await page.waitForURL(ready.remix+"/dashboard");
  await page.getByText("Nenhum vídeo ainda",{exact:true}).waitFor();
  await page.getByRole("link",{name:"Gerar GIFs",exact:true}).first().click();
  await page.getByRole("heading",{name:"Gerar GIFs",exact:true}).waitFor();
  await page.getByLabel("Sua chave da OpenAI").fill("sk-fictional-remix-browser-key");
  await page.getByRole("button",{name:"Salvar chave"}).click();
  await page.getByRole("button",{name:"Gerar com minha chave"}).waitFor();
  await page.getByRole("button",{name:"Ver GIF",exact:true}).click();
  const gifLink=page.getByRole("link",{name:"Baixar GIF",exact:true});
  await gifLink.waitFor();
  assert.match(await gifLink.getAttribute("href"),/^blob:/);
  const gifDownloadPromise=page.waitForEvent("download");
  await gifLink.click();
  const gifDownload=await gifDownloadPromise;
  const gifBytes=await readFile(await gifDownload.path());
  assert.match(gifBytes.subarray(0,6).toString(),/^GIF8[79]a$/);
  await page.getByRole("button",{name:"Remover chave"}).click();
  await page.getByRole("button",{name:"Gerar com minha chave"}).waitFor({state:"detached"});
  await page.getByRole("link",{name:"Novo vídeo",exact:true}).first().click();
  await page.locator("#title").fill("Corte do remix isolado");
  await page.locator('input[type="file"]').setInputFiles(join(root,".local/clips-pilot-video/fixture.mp4"));
  await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Enviar e gerar corte")&&!b.disabled));
  await page.getByRole("button",{name:"Enviar e gerar corte",exact:true}).click();
  await page.waitForURL(/\/project\//);
  await page.getByRole("button",{name:"Exportar",exact:true}).first().waitFor({timeout:45000});
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Exportar",exact:true}).first().click();
  const download=await downloadPromise;await download.saveAs(join(out,"corte-remix.mp4"));
  const video=await readFile(join(out,"corte-remix.mp4"));assert(video.length>100);assert.equal(video.subarray(4,8).toString(),"ftyp");
  await page.screenshot({path:join(out,"remix-projeto.png"),fullPage:true});
  await page.getByRole("button",{name:"Sair",exact:true}).press("Enter");
  await page.waitForURL(ready.hub+"/login");await page.getByRole("heading",{name:"Entrar na conta"}).waitFor();
  const copied=await context.newPage();await copied.goto(ready.copied+"/login");
  await copied.getByRole("alert").waitFor();
  assert.equal(new URL(copied.url()).origin,ready.copied);
  assert.deepEqual(faults,[]);
  await writeFile(join(out,"result.json"),JSON.stringify({status:"passed_locally",official_login:true,cross_site_return:true,reload_without_password:true,real_mp4_export:true,gif_key_saved_and_removed:true,private_gif_download:true,foreign_project_denied:true,technical_api_denied:true,logout:true,copied_origin_denied:true,tokens_not_in_browser_storage:true,supabase_requests:0,production_changed:false,unexpected_network_requests:faults},null,2)+"\n");
  console.log("Isolated Remix: official login, cross-site return, reload, upload, FFmpeg, download, logout and copied-origin refusal passed.");
} finally {await browser.close();}
