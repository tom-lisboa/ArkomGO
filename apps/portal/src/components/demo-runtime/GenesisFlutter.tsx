'use client';
import {useEffect,useRef,useState} from 'react';
import type {Session} from './api';
export default function GenesisFlutter({session,onQualification}:{session:Session;onQualification:()=>void}){
 const frame=useRef<HTMLIFrameElement>(null);const currentSession=useRef(session);currentSession.current=session;const [ready,setReady]=useState(false);const [slow,setSlow]=useState(false);
 useEffect(()=>{setReady(false);setSlow(false);const timeout=setTimeout(()=>setSlow(true),18000);
  function receive(event:MessageEvent){if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
   if(event.data?.type==='arkom.genesis.ready'){setReady(true);clearTimeout(timeout);frame.current?.contentWindow?.postMessage({type:'arkom.genesis.session',session:currentSession.current},window.location.origin);}
   if(event.data?.type==='arkom.genesis.qualification')onQualification();
  }
  window.addEventListener('message',receive);return()=>{clearTimeout(timeout);window.removeEventListener('message',receive)};
 },[onQualification]);
 useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({type:'arkom.genesis.session',session},window.location.origin)},[session,ready]);
 return <section className="genesis-flutter-frame" aria-label="Genesis Flutter" style={{position:'relative',background:'#090b0e',borderRadius:14,overflow:'hidden'}}>
  <style>{`.genesis-flutter-frame{height:calc(100dvh - 110px);min-height:480px}@media(max-width:700px){.genesis-flutter-frame{height:calc(100dvh - 170px);min-height:420px}}`}</style>
  {!ready&&<div role="status" style={{padding:32,color:'#d4b477',position:'absolute',inset:0,zIndex:2,background:'#090b0e',height:160}}>Preparando o Genesis em Flutter…{slow&&<p style={{fontSize:13}}>O estúdio está demorando para carregar. <button onClick={()=>{setSlow(false);if(frame.current)frame.current.src='/genesis-flutter/index.html'}}>Tentar novamente</button></p>}</div>}
  <iframe ref={frame} title="Genesis — estúdio de criação em Flutter" src="/genesis-flutter/index.html" style={{width:'100%',height:'100%',border:0,display:'block'}}/>
 </section>
}
