import {Lock, ShieldCheck} from 'lucide-react';
import type {Session} from './api';

type Props = {
  session: Session | null;
  tab: string;
  capabilities: Record<string, boolean> | null;
  onSelect: (tab: string) => void;
};

export default function SDRNavigation({session, tab, capabilities, onSelect}: Props) {
  const tabs = [
    {id: 'whatsapp', label: 'WhatsApp'},
    {id: 'chat', label: 'Conversas'},
    {id: 'business', label: 'Meu negócio'},
    {id: 'albums', label: 'Álbuns'},
    {id: 'automations', label: 'Automações'},
    {id: 'executions', label: 'Execuções'},
    {id: 'crm', label: 'CRM', capability: 'crm'},
    {id: 'calendar', label: 'Agendas', capability: 'calendar'},
    ...(session?.identity.role === 'admin' ? [
      {id: 'data', label: 'Meus dados', capability: 'customer_data'},
      {id: 'audit', label: 'Auditoria'},
    ] : []),
  ];
  const organization = session?.identity.organization_id === 'org_demo_alfa'
    ? 'Alfa Demonstração'
    : session?.identity.organization_id === 'org_demo_beta'
      ? 'Beta Demonstração' : 'Sua empresa';
  return <header className="sdr-navigation">
    <div className="sdr-masthead">
      <div className="sdr-brand">
        <img src="/agents/bia/demo-assets/arkom-sdr-logo.png" alt="Arkom SDR"/>
        <span>Relacionamento com contexto</span>
      </div>
      <div className="sdr-workspace">
        <ShieldCheck size={16} aria-hidden="true"/>
        <div><strong>{organization}</strong><span>Ambiente local</span></div>
      </div>
    </div>
    <nav aria-label="SDR Arkom">
      {tabs.map(item => {
        const pending = Boolean(item.capability && capabilities?.[item.capability] !== true);
        return <button key={item.id} type="button" aria-label={item.label}
          aria-current={tab === item.id ? 'page' : undefined}
          disabled={!session || pending}
          title={pending ? 'Em preparação neste ambiente' : undefined}
          onClick={() => onSelect(item.id)}>
          {pending && <Lock size={11} aria-hidden="true"/>}
          {item.label}
        </button>;
      })}
    </nav>
  </header>;
}
