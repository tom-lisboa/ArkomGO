const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const {compilePreview,policy}=require('../web/preview.js');
const Parser=new JSDOM('').window.DOMParser;
test('preview assembles local styles and scripts with restrictive CSP',()=>{
 const files={'frontend/index.html':'<html><head><base href="https://evil.example/"><link rel="stylesheet" href="./styles.css"></head><body><button>Calculate</button><script src="./app.js"></script><script src="https://evil.example/track.js"></script><iframe src="https://evil.example/"></iframe></body></html>','frontend/styles.css':'button{color:gold}','frontend/app.js':'document.title="calculator";'};
 const html=compilePreview(files,Parser);const doc=new Parser().parseFromString(html,'text/html');
 assert.equal(doc.querySelector('style').textContent,files['frontend/styles.css']);assert.match(doc.querySelector('script').src,/^data:text\/javascript;base64,/);assert.equal(doc.querySelectorAll('script').length,1);assert.equal(doc.querySelectorAll('base,iframe').length,0);assert.equal(doc.querySelector('meta[http-equiv]').content,policy);assert.match(policy,/connect-src 'none'/);assert.match(policy,/form-action 'none'/);
});
test('preview requires an actual interface',()=>{assert.throws(()=>compilePreview({},Parser),/interface/)});
test('sandbox grants scripts only, never same-origin or navigation permissions',()=>{const source=require('fs').readFileSync(require.resolve('../web/preview.js'),'utf8');assert.match(source,/setAttribute\('sandbox','allow-scripts'\)/);assert.ok(!source.includes('allow-same-origin'));assert.ok(!source.includes('allow-top-navigation'));});
