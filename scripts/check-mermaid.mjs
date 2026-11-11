import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window=dom.window;
globalThis.document=dom.window.document;
const {default:mermaid}=await import('mermaid');
mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
const catalog=JSON.parse(await readFile(new URL('../docs/mermaid/catalog.json',import.meta.url),'utf8'));
let errors=0;
for(const item of catalog){
 try{await mermaid.parse(await readFile(new URL('../'+item.diagram,import.meta.url),'utf8'))}
 catch(e){errors++;console.error(item.diagram+'\n'+e.message)}
}
console.log(`${catalog.length-errors}/${catalog.length} diagramas com sintaxe válida.`);
process.exitCode=errors?1:0;
