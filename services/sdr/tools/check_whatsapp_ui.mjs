// Validate the client boundary and render the disconnected screen without a browser.
// No provider requests, application sessions or database access occur here.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import Module from 'node:module';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(root,'frontend/package.json'));
const ts=require('typescript'),esbuild=require('esbuild'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const dir=path.join(root,'frontend/src'),seen=new Set();
const config=ts.readConfigFile(path.join(root,'frontend/tsconfig.json'),ts.sys.readFile);
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,path.join(root,'frontend')).options;
function visit(file){
 if(seen.has(file)||!file.startsWith(dir))return;seen.add(file);
 const raw=fs.readFileSync(file,'utf8'),parsed=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true);
 function inspect(node){
  if(ts.isStringLiteralLike(node))assert(!/evolution|@supabase|supabase\.(?:co|com)|lumi_|\/internal\//i.test(node.text),'Legacy provider or private authority in client: '+path.relative(root,file));
  ts.forEachChild(node,inspect);
 }
 inspect(parsed);
 for(const entry of ts.preProcessFile(raw,true,true).importedFiles){
  const target=ts.resolveModuleName(entry.fileName,file,options,ts.sys).resolvedModule?.resolvedFileName;
  if(target&&/\.tsx?$/.test(target)&&target.startsWith(dir))visit(target);
 }
}
visit(path.join(dir,'main.tsx'));
assert(seen.has(path.join(dir,'WhatsAppConnection.tsx'))&&seen.has(path.join(dir,'WhatsAppMessaging.tsx')));
const source=fs.readFileSync(path.join(dir,'LabApp.tsx'),'utf8');
assert(source.includes("[tab,setTab]=useState('whatsapp')"),'WhatsApp is not the initial screen');
const built=await esbuild.build({entryPoints:[path.join(dir,'WhatsAppConnection.tsx')],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',tsconfig:path.join(root,'frontend/tsconfig.json'),external:['react','react/jsx-runtime']});
const mod=new Module(path.join(root,'frontend/.whatsapp-ui-check.cjs'));
mod.filename=path.join(root,'frontend/.whatsapp-ui-check.cjs');
mod.paths=Module._nodeModulePaths(path.join(root,'frontend'));
mod._compile(built.outputFiles[0].text,mod.filename);
let calls=0;const previous=globalThis.fetch;globalThis.fetch=()=>{calls++;throw Error('Unexpected network request during render')};
try{
 const session={access_token:'render-check-only',identity:{user_id:'viewer',organization_id:'org_demo_alfa',role:'viewer',environment:'isolated-test'}};
 const html=renderToStaticMarkup(React.createElement(mod.exports.default,{session}));
 for(const label of ['Seu WhatsApp','Conectar o número','Autorizar os contatos','Conversar e acompanhar','QR Code','Código pelo número'])assert(html.includes(label),'Missing user control: '+label);
 assert(!/evolution|lumi|webhook|API Key|URL da API/i.test(html),'Provider setup leaked to the rendered UI');
 assert(!/type="password"/.test(html),'Provider password field leaked into WhatsApp settings');
 assert(calls===0,'Rendering unexpectedly accessed an external service');
}finally{globalThis.fetch=previous}
for(const file of fs.readdirSync(path.join(root,'frontend/dist/assets'))){
 if(/\.(?:js|css)$/.test(file)){const text=fs.readFileSync(path.join(root,'frontend/dist/assets',file),'utf8');assert(!/evolution|@supabase|supabase\.(?:co|com)|lumi_|sdr_create-evolution|sdr_get-evolution/i.test(text),'Legacy integration in compiled client '+file)}
}
console.log(JSON.stringify({passed:true,reachable_client_modules:seen.size,legacy_provider_fields:false,initial_screen:'WhatsApp',network_calls_during_render:calls,browser_visual_verified:false}));

const publishedIndex=fs.readFileSync(path.join(root,"frontend/dist/index.html"),"utf8");
const publishedAssets=[...publishedIndex.matchAll(/(?:src|href)="([^"<>]+\.(?:js|css))"/g)].map(match=>match[1]);
assert(publishedAssets.length>=2&&publishedAssets.every(url=>url.startsWith("/sdr-next/assets/")),"Build the hosted pilot with npm run build:pilot; its assets must stay under /sdr-next/");
