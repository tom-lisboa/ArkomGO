/* Generated applications run in an opaque-origin sandbox, without the Arkom session. */
(function(global){
'use strict';
const policy="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
function compilePreview(files,Parser=global.DOMParser){
 if(!files['frontend/index.html'])throw Error('A interface ainda não foi criada.');
 const doc=new Parser().parseFromString(files['frontend/index.html'],'text/html');
 const resolve=(value)=>{const url=new URL(value,'https://preview.invalid/frontend/index.html');if(url.origin!=='https://preview.invalid')return null;return decodeURIComponent(url.pathname.slice(1));};
 const data=(type,value)=>'data:'+type+';base64,'+btoa(unescape(encodeURIComponent(value)));
 doc.querySelectorAll('base,meta[http-equiv],iframe,object,embed').forEach(el=>el.remove());
 for(const el of doc.querySelectorAll('link[rel="stylesheet"]')){const name=resolve(el.getAttribute('href')||'');if(name&&files[name]!==undefined){const style=doc.createElement('style');style.textContent=files[name];el.replaceWith(style);}else el.remove();}
 for(const el of doc.querySelectorAll('script[src]')){const name=resolve(el.getAttribute('src')||'');if(name&&files[name]!==undefined){el.src=data('text/javascript',files[name]);el.removeAttribute('integrity');el.removeAttribute('crossorigin');}else el.remove();}
 const security=doc.createElement('meta');security.httpEquiv='Content-Security-Policy';security.content=policy;doc.head.prepend(security);
 const referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';doc.head.prepend(referrer);
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
function createPreview(files){const iframe=global.document.createElement('iframe');iframe.title='Sua solução — prévia interativa';iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('referrerpolicy','no-referrer');iframe.style.cssText='width:100%;height:100%;border:0;background:#0b0b10;display:block';iframe.srcdoc=compilePreview(files);return iframe;}
global.genesisPreview={compilePreview,createPreview};
if(typeof module!=='undefined')module.exports={compilePreview,createPreview,policy};
})(globalThis);
