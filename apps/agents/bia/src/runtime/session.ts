import type {Session} from './api';

type Entry = {session:Session; tab:string; surface:'sdr'|'agenda'};
const tabs = ['whatsapp','chat','business','albums','automations','executions','crm','calendar','data','audit'];
let current:Session|null = null;
let pending:Promise<Entry>|null = null;

export function forgetDemoSession() { current=null; pending=null; }

export function connectToPlatform():Promise<Entry> {
 if(pending) return pending;
 pending = new Promise((resolve,reject) => {
  if(window.parent===window) { reject(Error('Abra a BIA dentro da Arkom.')); return; }
  const requestId=crypto.randomUUID();
  const origin=window.location.origin;
  const timeout=window.setTimeout(()=>finish(Error('Não foi possível abrir a BIA. Volte à Arkom e tente novamente.')),25000);
  function finish(error:Error) {
   window.clearTimeout(timeout);
   window.removeEventListener('message',receive);
   pending=null;
   reject(error);
  }
  function receive(event:MessageEvent) {
   const data=event.data;
   if(event.source!==window.parent||event.origin!==origin||data?.type!=='arkom.bia.session'||data.requestId!==requestId) return;
   if(typeof data.session?.access_token!=='string'||!data.session?.identity?.organization_id) {
    finish(Error('Sua sessão não está disponível. Abra a BIA novamente.')); return;
   }
   window.clearTimeout(timeout);
   window.removeEventListener('message',receive);
   current=data.session;
   window.parent.postMessage({type:"arkom.bia.opened",requestId},origin);
   resolve({session:data.session,tab:tabs.includes(data.tab)?data.tab:'whatsapp',surface:data.surface==='agenda'?'agenda':'sdr'});
  }
  window.addEventListener('message',receive);
  window.parent.postMessage({type:'arkom.bia.ready',requestId},origin);
 });
 return pending;
}

export async function demoSession():Promise<Session> {
 if(current) return current;
 return (await connectToPlatform()).session;
}
