'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Session} from './demo-runtime/api';
import {demoSession} from './demo-runtime/session';
import GenesisFlutter from './demo-runtime/GenesisFlutter';
export default function PlatformFlutter({view}:{view:string}){
 const router=useRouter();const [session,setSession]=useState<Session|null>(null);const [error,setError]=useState(false);const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;demoSession().then(s=>{if(active){setSession(s);setError(false)}}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[attempt]);
 if(!session)return <main style={{height:'100dvh',display:'grid',placeContent:'center',background:'#0b0c0e',color:'#d4b477',fontFamily:'sans-serif'}} role="status">{error?<><p>Não foi possível abrir a plataforma local.</p><button onClick={()=>setAttempt(a=>a+1)}>Tentar novamente</button></>:<p>Preparando seu espaço Arkom…</p>}</main>;
 return <GenesisFlutter session={session} initialView={view} fullScreen onQualification={()=>router.push('/demo/genesis')}/>;
}
