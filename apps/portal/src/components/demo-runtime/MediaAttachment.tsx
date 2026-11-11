import {useEffect,useRef,useState} from 'react';
import {Button} from './components/Button';
import {type Session} from './api';
import {mediaBlob,type MessageMedia} from './media-api';
export default function MediaAttachment({session,file}:{session:Session;file:MessageMedia}){
 const [url,setURL]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const live=useRef(true),objectURL=useRef('');
 useEffect(()=>{live.current=true;return()=>{live.current=false;if(objectURL.current)URL.revokeObjectURL(objectURL.current)}},[file.id]);
 async function open(){setBusy(true);setError('');try{const blob=await mediaBlob(session,file.id);if(!live.current)return;const next=URL.createObjectURL(blob);if(objectURL.current)URL.revokeObjectURL(objectURL.current);objectURL.current=next;setURL(next)}catch{if(live.current)setError('Anexo indisponível. Atualize a conversa ou confira com a equipe.')}finally{if(live.current)setBusy(false)}}
 const label=file.kind==='audio'?'Ouvir áudio':file.kind==='image'?'Ver imagem':file.kind==='video'?'Ver vídeo':'Abrir arquivo';
 return <div className="lab-media-attachment"><strong>{file.name||'Anexo'}</strong><small>{file.status==='pending'||file.status==='processing'?'Preparando leitura…':file.status==='failed'?'Leitura não concluída · conferir com a equipe':`${Math.ceil(file.size/1024)} KB`}</small>{url?<>{file.kind==='image'?<img src={url} alt={file.name||'Imagem da conversa'}/>:file.kind==='audio'?<audio controls src={url} aria-label="Áudio da conversa"/>:file.kind==='video'?<video controls src={url} aria-label="Vídeo da conversa"/>:null}<a href={url} download={file.name||'arquivo'}>Baixar arquivo</a></>:<Button size="sm" variant="outline" disabled={busy} onClick={()=>void open()}>{busy?'Abrindo…':label}</Button>}{error&&<span role="alert">{error}</span>}</div>
}
