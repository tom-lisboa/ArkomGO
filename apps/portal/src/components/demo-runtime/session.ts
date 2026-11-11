import {request,type Session} from './api';

// One in-memory session across the portal. Never put credentials in localStorage.
// Deduplication also prevents React StrictMode from creating two demo logins.
let current:Session|null=null;
let expiresAt=0;
let pending:Promise<Session>|null=null;
export function forgetDemoSession(){current=null;expiresAt=0;}
export function demoSession():Promise<Session>{
 if(current&&Date.now()<expiresAt)return Promise.resolve(current);
 if(pending)return pending;
 pending=request<Session>('/__test/ui/local-enter',undefined,{})
  .then(session=>{current=session;expiresAt=Date.now()+50*60*1000;return session})
  .finally(()=>{pending=null});
 return pending;
}
