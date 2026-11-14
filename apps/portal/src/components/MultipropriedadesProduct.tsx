'use client';

import Link from 'next/link';
import {ArrowLeft, Building2} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {ApiError,request} from './demo-runtime/api';
import {demoSession} from './demo-runtime/session';
import styles from './multipropriedades.module.css';

const product = 'http://127.0.0.1:8180';
const portal = 'http://127.0.0.1:3007';
const route = '/v1/sdr/genesis-demo/ecosystem/multipropriedades/session';
type ProductSession = {access_token:string;refresh_token:string};

export default function MultipropriedadesProduct() {
 const frame = useRef<HTMLIFrameElement>(null);
 const [attempt,setAttempt] = useState(0);
 const [status,setStatus] = useState<'loading'|'open'|'unavailable'|'forbidden'|'origin'>('loading');

 useEffect(() => {
  if (window.location.origin !== portal) {
   setStatus('origin');
   return;
  }

  const controller = new AbortController();
  let requestId: string | undefined;
  const timeout = window.setTimeout(() => fail('unavailable'), 25000);
  function fail(reason: 'unavailable'|'forbidden') {
   window.clearTimeout(timeout);
   controller.abort();
   setStatus(reason);
  }
  async function receive(event: MessageEvent) {
   const child = frame.current?.contentWindow;
   if (controller.signal.aborted || event.origin !== product || !child || event.source !== child) return;
   const message = event.data;
   if (message?.type === 'arkom.multi.ready' && !requestId && typeof message.requestId === 'string') {
    requestId = message.requestId;
    try {
     const identity = await demoSession();
     const session = await request<ProductSession>(route,identity,{},undefined,controller.signal);
     if (!controller.signal.aborted) child.postMessage({type:'arkom.multi.session',session,requestId}, product);
    } catch (error) {
     if (!controller.signal.aborted) fail(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'unavailable');
    }
   } else if (requestId && message?.requestId === requestId) {
    if (message.type === 'arkom.multi.opened') {
     window.clearTimeout(timeout);
     setStatus('open');
    }
    if (message.type === 'arkom.multi.failed') fail('unavailable');
   }
  }
  window.addEventListener('message',receive);
  if (frame.current) frame.current.src = product + '/__arkom/entrar';
  return () => {
   window.removeEventListener('message',receive);
   window.clearTimeout(timeout);
   controller.abort();
  };
 },[attempt]);

 const showFrame = status === 'loading' || status === 'open';
 return <main className={styles.workspace}>
  <header className={styles.bar}>
   <Link href="/demo/systems/multipropriedades"><ArrowLeft size={17}/> Sistemas</Link>
   <h1><Building2 size={18}/> Arkom Multipropriedades</h1>
   <span>Espaço de teste</span>
  </header>
  <section className={styles.stage} aria-label="Painel do Multipropriedades">
   {showFrame && <iframe ref={frame} key={attempt} title="Arkom Multipropriedades"
    className={styles.frame} style={{visibility:status === 'open' ? 'visible' : 'hidden'}}
    referrerPolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"/>}
   {status !== 'open' && <div className={styles.message} role="status">
    {status === 'loading' && <p>Abrindo o Multipropriedades da sua empresa…</p>}
    {status === 'forbidden' && <p>O Multipropriedades ainda não foi liberado para esta conta.</p>}
    {status === 'origin' && <a href={portal + '/demo/multipropriedades'}>Abrir o Multipropriedades na Arkom local</a>}
    {status === 'unavailable' && <><p>Não foi possível abrir o Multipropriedades.</p><button onClick={() => {setStatus('loading');setAttempt(value => value + 1);}}>Tentar novamente</button></>}
   </div>}
  </section>
 </main>;
}
