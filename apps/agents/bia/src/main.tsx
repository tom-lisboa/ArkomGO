import {createRoot} from 'react-dom/client';
import LabApp from './runtime/LabApp';
import {connectToPlatform} from './runtime/session';
import './base.css';
import './runtime/lab.css';
import './product.css';
import './agent.css';

const root=createRoot(document.getElementById('root')!);
root.render(<p className="agent-loading" role="status">Abrindo a BIA…</p>);
void connectToPlatform().then(({tab}) => {
 root.render(<section className="arkom-demo"><div className="demo-runtime sdr-product-runtime">
  <LabApp initialTab={tab} productMode/>
 </div></section>);
}).catch((error:Error) => {
 root.render(<div className="agent-loading" role="alert"><p>{error.message}</p>
  <a href="/demo/sdr" target="_top">Abrir a BIA na Arkom</a></div>);
});
