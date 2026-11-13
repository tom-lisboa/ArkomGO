import {notFound} from 'next/navigation';
import Demo from '@/components/ArkomDemo';
const views=new Set(['home','map','systems','sdr','crm','genesis','business','automations','executions','audit','data','calendar','whatsapp','clips']);
export default async function Page({params}:{params:Promise<{view?:string[]}>}){
 if(process.env.ARKOM_LOCAL_DEMO!=='true')notFound();
 const {view}=await params;
 const selected=view?.[0]??'home';
 if((view?.length??0)>1||!views.has(selected))notFound();
 return <Demo view={selected}/>;
}
