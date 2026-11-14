import {notFound,redirect} from 'next/navigation';
import Demo from '@/components/ArkomDemo';
import {isLocalDemoDestination} from '@/lib/local-solutions';
const views=new Set(['automations','executions','audit','data','calendar','whatsapp']);
export default async function Page({params}:{params:Promise<{view?:string[]}>}){
 if(process.env.ARKOM_LOCAL_DEMO!=='true')notFound();
 const {view}=await params;
 const selected=view?.join('/')||'home';
 if(selected==='systems')redirect('/demo/tools');
 if(!views.has(selected)&&!isLocalDemoDestination(selected))notFound();
 return <Demo view={selected}/>;
}
