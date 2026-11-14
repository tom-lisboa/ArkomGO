import {createRoot} from 'react-dom/client';
import {Workspace} from './App';
import {FinanceAISession} from '../../examples/lovable/session';
import './style.css';

const portal = 'http://127.0.0.1:3007';
const product = 'http://127.0.0.1:8194';
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const nonce = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const root = createRoot(document.getElementById('root')!);

async function connect() {
  if (window.parent === window || window.location.origin !== product) return;
  const verifier = nonce();
  const state = nonce();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  async function receive(event: MessageEvent) {
    const data = event.data;
    if (event.origin !== portal || event.source !== window.parent ||
      data?.type !== 'arkom.finance.handoff' || data.state !== state) return;
    window.removeEventListener('message', receive);
    try {
      if (!['alfa', 'beta'].includes(data.company) || typeof data.name !== 'string') throw Error('invalid_company');
      const apiBase = product + '/api/' + data.company;
      const session = new FinanceAISession(apiBase, data.installationId);
      await session.exchangeArkomHandoff(data.code, state, verifier);
      const modes = {bankingMode:'simulated', aiMode:'simulated', fiscalMode:'simulated', portalConnected:true};
      root.render(<Workspace session={session} name={data.name} modes={modes} apiBase={apiBase}
        onExit={() => {
          root.unmount();
          window.parent.postMessage({type:'arkom.finance.exited', state}, portal);
        }} />);
      window.parent.postMessage({type:'arkom.finance.opened', state}, portal);
    } catch {
      window.parent.postMessage({type:'arkom.finance.failed', state}, portal);
    }
  }
  window.addEventListener('message', receive);
  window.parent.postMessage({type:'arkom.finance.ready', challenge, state}, portal);
}

void connect();
