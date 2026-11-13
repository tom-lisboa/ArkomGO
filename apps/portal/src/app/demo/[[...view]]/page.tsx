import {notFound} from 'next/navigation';
import Demo from '@/components/ArkomDemo';
import {isLocalSolutionDetail} from '@/lib/local-solutions';
const views=new Set(['home','map','systems','sdr','crm','genesis','business','automations','executions','audit','data','calendar','whatsapp','clips']);
export default async function Page({params}:{params:Promise<{view?:string[]}>}){
 if(process.env.ARKOM_LOCAL_DEMO!=='true')notFound();
 const {view}=await params;
 const selected=view?.join('/')||'home';
 if(!views.has(selected)&&!isLocalSolutionDetail(selected))notFound();
 return <Demo view={selected}/>;
}
