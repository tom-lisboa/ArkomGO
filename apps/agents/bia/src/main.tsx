import {platformHome, platformFont} from './paths';
import {createRoot} from 'react-dom/client';
import LabApp from './runtime/LabApp';
import CalendarAgent from './CalendarAgent';
import {connectToPlatform} from './runtime/session';
import './base.css';
import './runtime/lab.css';
import './product.css';
import './agent.css';

void new FontFace('ArkomSans', 'url('+platformFont+')').load().then(font=>document.fonts.add(font)).catch(()=>{});

const root=createRoot(document.getElementById('root')!);
root.render(<p className="agent-loading" role="status">Abrindo seu agente…</p>);
void connectToPlatform().then(({tab,session,surface}) => {
 root.render(<section className="arkom-demo"><div className="demo-runtime sdr-product-runtime">
  {surface==='agenda'?<CalendarAgent session={session}/>:<LabApp initialTab={tab} productMode/>}
 </div></section>);
}).catch((error:Error) => {
 root.render(<div className="agent-loading" role="alert"><p>{error.message}</p>
  <a href={platformHome} target="_top">Abrir meu time na Arkom</a></div>);
});
