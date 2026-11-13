// Host-owned routing contract. Generated code is compiled, never executed here.
export const navigationPath = 'design/navigation.json';
const routePattern = /^\/(?:[a-z0-9-]+\/)*(?:[a-z0-9-]+|:[a-z][a-z0-9_]*)?$|^\/$/;
const componentPattern = /^frontend\/src\/pages\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.svelte$/;
export function readNavigation(files) {
  if (!Object.hasOwn(files, navigationPath)) return null;
  const raw = files[navigationPath];
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 24000) throw Error('Mapa de navegação excede 24 KB.');
  const plan = JSON.parse(raw);
  const keys = (v, names) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => names.includes(k));
  if (!keys(plan,['schema','home','routes']) || plan.schema !== 'arkom.navigation.v1' || !Array.isArray(plan.routes) || plan.routes.length < 1 || plan.routes.length > 12) throw Error('Mapa de navegação inválido: use schema arkom.navigation.v1, home e 1 a 12 routes.');
  const seen = new Set();
  for (const r of plan.routes) {
    if (!keys(r,['path','title','component','menu']) || typeof r.path !== 'string' || r.path.length > 100 || !routePattern.test(r.path) || (r.path !== '/' && r.path.endsWith('/')) || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 80 || typeof r.component !== 'string' || !componentPattern.test(r.component) || typeof r.menu !== 'boolean' || r.menu && r.path.includes(':')) throw Error('Rota inválida: path local, title, component em frontend/src/pages/ e menu booleano; detalhes parametrizados ficam fora do menu.');
    const shape = r.path.replace(/:[a-z][a-z0-9_]*/g, ':param');
    if (seen.has(shape)) throw Error('Rotas duplicadas ou ambíguas: '+r.path);
    seen.add(shape);
  }
  if (!plan.routes.some(r => r.path === plan.home && !r.path.includes(':'))) throw Error('home deve apontar para uma rota estática declarada.');
  if (!plan.routes.some(r => r.menu)) throw Error('Declare ao menos uma rota no menu.');
  return plan;
}
export function navigationSources(plan) {
  const routes = [...plan.routes].sort((a,b)=>Number(a.path.includes(':'))-Number(b.path.includes(':')));
  const data = JSON.stringify(routes).replace(/</g,'\\u003c');
  const home = JSON.stringify(plan.home);
  return {
    'navigation.js': `import { readable } from 'svelte/store';
export const routes = Object.freeze(${data}.map(Object.freeze));
export function href(path) { if(typeof path !== 'string' || !/^\\/(?!\\/)[^?#\\\\\\s]*$/.test(path)) throw Error('Rota local inválida'); return '#'+path; }
export function navigate(path) { window.location.hash = href(path); }
function resolve() {
 let path = window.location.hash.slice(1) || ${home};
 if (path !== '/' && path.endsWith('/')) path = path.slice(0,-1);
 for(const route of routes) {
  const expected=route.path.split('/'), actual=path.split('/');
  if(expected.length!==actual.length)continue;
  const params={};let matches=true;
  for(let i=0;i<expected.length;i++) {
   if(expected[i].startsWith(':')) { try { const value=decodeURIComponent(actual[i]); if(!value || /[\\/\\\\\\x00-\\x1f]/.test(value)) {matches=false;break;} params[expected[i].slice(1)]=value; } catch {matches=false;break;} }
   else if(expected[i]!==actual[i]) {matches=false;break;}
  }
  if(matches)return {path,route,params};
 }
 return {path,route:null,params:{}};
}
export const current = readable(resolve(),set=>{const update=()=>set(resolve());window.addEventListener('hashchange',update);update();return ()=>window.removeEventListener('hashchange',update);});
`,
    'Router.svelte': `<script>
import { tick } from 'svelte';
import { current, href } from './navigation.js';
${routes.map((r,i)=>`import Page${i} from ${JSON.stringify(r.component)};`).join('\n')}
const pages = {${routes.map((r,i)=>JSON.stringify(r.path)+':Page'+i).join(',')}};
let Page = $derived($current.route ? pages[$current.route.path] : null);
let region = $state();
$effect(()=>{const title=$current.route?.title || 'Página não encontrada';document.title=title;tick().then(()=>region?.focus());});
</script>
<section bind:this={region} tabindex="-1" aria-label={$current.route?.title || 'Página não encontrada'}>
{#key $current.path}{#if Page}<Page params={$current.params} />{:else}<h1>Página não encontrada</h1><p>Este endereço não faz parte do aplicativo.</p><a href={href(${home})}>Voltar ao início</a>{/if}{/key}
</section>
`
  };
}
