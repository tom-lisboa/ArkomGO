// Trusted build configuration. Application sources are parsed and bundled,
// never imported/executed by Node; no project scripts/plugins are loaded.
import { readNavigation, navigationSources } from './navigation.mjs';
import { compile, compileModule } from 'svelte/compiler';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourcesRoot = 'frontend/src/';
const runtimeModules = new Set(['svelte', 'svelte/store', 'svelte/motion', 'svelte/transition', 'svelte/easing', 'svelte/events', 'svelte/animate', 'svelte/reactivity']);
const validSource = name => /^frontend\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:svelte|js|ts|css)$/.test(name) && !name.split('/').some(p => p.startsWith('.'));
const diagnostic = (v, fallback = 'frontend/src/App.svelte') => ({
  file: v.filename || v.location?.file?.replace(/^application:/, '') || fallback,
  line: v.start?.line || v.location?.line || 0,
  column: v.start?.column ?? v.location?.column ?? 0,
  message: String(v.message || v.text || v).slice(0, 1600),
  code: v.code || 'compile_error',
});

export async function compileFrontend(files) {
  const sources = Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith(sourcesRoot)));
  if (!sources['frontend/src/App.svelte']) throw Error('Escreva frontend/src/App.svelte antes de compilar.');
  if (Object.keys(sources).length > 48 || Object.values(sources).some(v => typeof v !== 'string' || Buffer.byteLength(v) > 48000) || Object.values(sources).reduce((n,v) => n + Buffer.byteLength(v),0) > 350000 || Object.keys(sources).some(name => !validSource(name))) throw Error('Fontes fora dos limites do frontend.');
  const navigation = readNavigation(files);
  const hostSources = navigation ? navigationSources(navigation) : {};
  if (navigation) for (const route of navigation.routes) if (!sources[route.component]) throw Error('Implemente a tela declarada: '+route.component);
  const warnings = [];
  const plugin = {
    name: 'genesis-svelte',
    setup(builder) {
      const resolveRuntime = async name => {
        const resolved = await builder.resolve(name,{resolveDir:root,kind:'import-statement'});
        return {path:resolved.path,errors:resolved.errors};
      };
      builder.onResolve({filter: /.*/, namespace: 'application'}, async args => {
        if (args.path === '@arkom/navigation' || args.path === '@arkom/Router.svelte') {
          if (!navigation) return {errors:[{text:'Declare design/navigation.json antes de usar o roteador.'}]};
          return {path:args.path === '@arkom/navigation' ? 'navigation.js' : 'Router.svelte',namespace:'navigation'};
        }
        if (runtimeModules.has(args.path) || (args.pluginData?.compiled && /^svelte\/(?:internal|legacy)(?:\/|$)/.test(args.path))) {
          return resolveRuntime(args.path);
        }
        if (!args.path.startsWith('./') && !args.path.startsWith('../')) return {errors:[{text:`Importação não permitida: ${args.path}`} ]};
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer),args.path));
        if (!validSource(resolved) || !Object.hasOwn(sources,resolved)) return {errors:[{text:`Arquivo local indisponível: ${args.path}`} ]};
        return {path:resolved,namespace:'application'};
      });
      builder.onResolve({filter:/.*/,namespace:'navigation'}, async args => {
        if (args.path.startsWith('svelte')) return resolveRuntime(args.path);
        if (args.path === './navigation.js') return {path:'navigation.js',namespace:'navigation'};
        if (sources[args.path]) return {path:args.path,namespace:'application'};
        return {errors:[{text:'Módulo de navegação indisponível'}]};
      });
      builder.onLoad({filter:/.*/,namespace:'navigation'}, args => ({contents:args.path.endsWith('.svelte') ? compile(hostSources[args.path],{filename:args.path,generate:'client',css:'injected',dev:false}).js.code : hostSources[args.path],loader:'js'}));
      builder.onResolve({filter:/^genesis-entry$/}, () => ({path:'entry.js',namespace:'entry'}));
      builder.onLoad({filter:/.*/,namespace:'entry'}, () => ({contents:`import { mount } from 'svelte'; import App from './App.svelte'; mount(App,{target:document.getElementById('app')});`,loader:'js'}));
      builder.onResolve({filter:/.*/,namespace:'entry'}, async args => args.path === 'svelte' ? await resolveRuntime('svelte') : {path:'frontend/src/App.svelte',namespace:'application'});
      builder.onLoad({filter:/.*/,namespace:'application'}, args => {
        const source = sources[args.path];
        try {
          if (args.path.endsWith('.svelte')) {
            const output = compile(source,{filename:args.path,generate:'client',css:'injected',dev:false});
            warnings.push(...output.warnings.map(v=>diagnostic(v,args.path)));
            return {contents:output.js.code,loader:'js',pluginData:{compiled:true}};
          }
          if (/\.svelte\.[jt]s$/.test(args.path)) {
            const output = compileModule(source,{filename:args.path,generate:'client',dev:false});
            warnings.push(...output.warnings.map(v=>diagnostic(v,args.path)));
            return {contents:output.js.code,loader:'js',pluginData:{compiled:true}};
          }
          return {contents:source,loader:args.path.endsWith('.css')?'css':args.path.endsWith('.ts')?'ts':'js'};
        } catch(error) {
          return {errors:[{text:JSON.stringify(diagnostic(error,args.path))}]};
        }
      });
    }
  };
  const result = await build({entryPoints:['genesis-entry'],bundle:true,write:false,metafile:true,outdir:'/output',entryNames:'bundle',format:'iife',platform:'browser',conditions:['browser'],target:['es2022'],minify:true,sourcemap:false,legalComments:'inline',logLevel:'silent',plugins:[plugin],absWorkingDir:root,define:{'process.env.NODE_ENV':'"production"'}});
  const outputs = Object.fromEntries(result.outputFiles.map(v=>[path.basename(v.path),v.text]));
  if (!outputs['bundle.js'] || result.outputFiles.some(v=>v.contents.length>256*1024) || result.outputFiles.reduce((n,v)=>n+v.contents.length,0)>384*1024) throw Error('O frontend compilado ultrapassa o limite. Reduza esta entrega.');
  if (Object.keys(outputs).some(name=>!['bundle.js','bundle.css'].includes(name))) throw Error('Saída de compilação inesperada.');
  warnings.push(...result.warnings.map(v=>diagnostic(v)));
  const used = new Set(Object.keys(result.metafile.inputs).filter(name=>name.startsWith('application:')).map(name=>name.slice('application:'.length)));
  if (navigation && !Object.hasOwn(result.metafile.inputs,'navigation:Router.svelte')) throw Error('Renderize o roteador compartilhado: importe Router de @arkom/Router.svelte e use <Router /> em App.svelte.');
  for (const name of Object.keys(sources)) {
    if (!used.has(name)) warnings.push({file:name,line:0,column:0,code:'unused_source',message:'Este arquivo não faz parte do bundle. O host monta App.svelte; importe CSS e componentes a partir dele ou de seus módulos.'});
  }
  return {javascript:outputs['bundle.js'],css:outputs['bundle.css'] || '',warnings:warnings.slice(0,30),navigation:navigation ? {schema:navigation.schema,home:navigation.home,routes:navigation.routes} : null};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let input = '';
    for await (const part of process.stdin) {
      input += part;
      if (Buffer.byteLength(input)>512*1024) throw Error('Entrada muito grande.');
    }
    process.stdout.write(JSON.stringify({ok:true,...await compileFrontend(JSON.parse(input))}));
  } catch(error) {
    const diagnostics = error.errors?.map(v=>diagnostic(v)) || [diagnostic(error)];
    process.stdout.write(JSON.stringify({ok:false,errors:diagnostics.slice(0,20)}));
    process.exitCode = 1;
  }
}
