'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Wallet} from 'lucide-react';
import {ApiError, request} from './demo-runtime/api';
import {demoSession} from './demo-runtime/session';
import styles from './multipropriedades.module.css';

const portal = 'http://127.0.0.1:3007';
const product = 'http://127.0.0.1:8194';
const handoffPath = '/v1/sdr/genesis-demo/ecosystem/financeai/session';
type Handoff = {code:string; state:string; company:string; installationId:string; name:string};
type Status = 'loading'|'open'|'unavailable'|'forbidden'|'origin';

export default function FinanceAIProduct() {
 const router = useRouter();
 const frame = useRef<HTMLIFrameElement>(null);
 const [attempt, setAttempt] = useState(0);
 const [status, setStatus] = useState<Status>('loading');

 useEffect(() => {
  if (window.location.origin !== portal) {
   setStatus('origin');
   return;
  }
  const controller = new AbortController();
  let state: string | undefined;
  const timeout = window.setTimeout(() => fail('unavailable'), 25000);
  function fail(reason: 'unavailable'|'forbidden') {
   window.clearTimeout(timeout);
   controller.abort();
   setStatus(reason);
  }

  async function receive(event: MessageEvent) {
   const child = frame.current?.contentWindow;
   if (controller.signal.aborted || event.origin !== product || !child || event.source !== child) return;
   const data = event.data;
   if (data?.type === 'arkom.finance.ready' && state === undefined &&
    typeof data.state === 'string' && typeof data.challenge === 'string') {
    state = data.state;
    try {
     const session = await demoSession();
     const handoff = await request<Handoff>(handoffPath, session,
      {state, challenge:data.challenge}, undefined, controller.signal);
     if (!controller.signal.aborted && handoff.state === state) {
      child.postMessage({...handoff, type:'arkom.finance.handoff'}, product);
     }
    } catch (error) {
     if (!controller.signal.aborted) fail(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'unavailable');
    }
   } else if (state && data?.state === state) {
    if (data.type === 'arkom.finance.opened') {
     window.clearTimeout(timeout);
     setStatus('open');
    } else if (data.type === 'arkom.finance.failed') {
     fail('unavailable');
    } else if (data.type === 'arkom.finance.exited') {
     router.push('/demo/team');
    }
   }
  }

  window.addEventListener('message', receive);
  if (frame.current) frame.current.src = product;
  return () => {
   window.removeEventListener('message', receive);
   window.clearTimeout(timeout);
   controller.abort();
  };
 }, [attempt, router]);

 return <main className={styles.workspace}>
  <header className={styles.bar}>
   <Link href="/demo/team"><ArrowLeft size={17}/> Seu time</Link>
   <h1><Wallet size={18}/> FinanceAI</h1>
   <span>Homologação</span>
  </header>
  <section className={styles.stage} aria-label="Painel do FinanceAI">
   {(status === 'loading' || status === 'open') && <iframe ref={frame} key={attempt}
    title="FinanceAI" className={styles.frame} style={{visibility:status === 'open' ? 'visible' : 'hidden'}}
    referrerPolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"/>}
   {status !== 'open' && <div className={styles.message} role="status">
    {status === 'loading' && <p>Abrindo o FinanceAI da sua empresa…</p>}
    {status === 'forbidden' && <p>O FinanceAI ainda não foi liberado para esta conta.</p>}
    {status === 'origin' && <a href={portal + '/demo/financeai'}>Abrir o FinanceAI na Arkom local</a>}
    {status === 'unavailable' && <>
     <p>Não foi possível abrir o FinanceAI.</p>
     <button onClick={() => {setStatus('loading'); setAttempt(value => value + 1);}}>Tentar novamente</button>
    </>}
   </div>}
  </section>
 </main>;
}
