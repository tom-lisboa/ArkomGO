import {NextRequest} from 'next/server';
export const runtime='nodejs';
async function proxy(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
 if(process.env.ARKOM_LOCAL_DEMO!=='true'||!['localhost','127.0.0.1'].includes(req.nextUrl.hostname))return new Response('Not found',{status:404});
 if(req.method==='POST'){
  const origin=req.headers.get('origin');
  // Next may normalize nextUrl to localhost; compare the browser origin to
  // the actual request Host, and restrict both to the loopback demo.
  let sameOrigin=!origin;
  if(origin){try{const url=new URL(origin);sameOrigin=url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.host===req.headers.get('host')}catch{sameOrigin=false}}
  if(!sameOrigin||req.headers.get('sec-fetch-site')==='cross-site')return new Response('Forbidden',{status:403});
 }
 const {path}=await params;
 if(!['v1/sdr','v1/platform','v1/core','v1/customer','__test/ui'].includes(path.slice(0,2).join('/'))||path.some(p=>p==='..'))return new Response('Not found',{status:404});
 const headers=new Headers();for(const k of ['content-type','authorization','idempotency-key','last-event-id']){const v=req.headers.get(k);if(v)headers.set(k,v)}
 try{const response=await fetch('http://127.0.0.1:8080/'+path.map(encodeURIComponent).join('/')+req.nextUrl.search,{method:req.method,headers,body:req.method==='GET'?undefined:await req.arrayBuffer(),cache:'no-store',redirect:'error',signal:req.signal});return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('content-type')??'application/json','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}})}catch{return Response.json({error:'demo_backend_unavailable'},{status:503})}
}
export {proxy as GET,proxy as POST};
