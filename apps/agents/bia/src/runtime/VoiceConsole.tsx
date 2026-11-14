import {useEffect, useState} from 'react';
import {PhoneCall} from 'lucide-react';
import {Button} from './components/Button';
import {ApiError, describe, request, type Conversation, type Session} from './api';

type Profile = {
  name: string;
  greeting: string;
  instructions: string;
  model: string;
  voice: string;
  max_seconds: number;
};

type Config = {
  available: boolean;
  configured: boolean;
  enabled: boolean;
  can_configure: boolean;
  revision: number;
  account_sid?: string;
  sender_sid?: string;
  template_sid?: string;
  sender?: string;
  test_phone?: string;
  profile?: Profile;
  messaging_webhook?: string;
  voice_webhook?: string;
};

type Call = {id: string; status: string; created_at: string; conversation_id?: string; error_code?: string};
type Draft = {account_sid: string; sender_sid: string; template_sid: string; test_phone: string; profile: Profile};
type CallInput = {test: true} | {conversation_id: string};

const base = '/v1/sdr/voice';
const defaultProfile: Profile = {
  name: '',
  greeting: 'Olá, tudo bem? Posso falar com você por um momento?',
  instructions: '',
  model: 'gpt-realtime-mini',
  voice: 'marin',
  max_seconds: 120,
};
const labels: Record<string,string> = {
  queued_permission: 'Pedido de autorização na fila',
  requesting: 'Enviando autorização',
  awaiting_permission: 'Aguardando aceite no WhatsApp',
  approved: 'Autorização recebida',
  dialing: 'Iniciando ligação',
  queued: 'Ligação na fila da Twilio',
  initiated: 'Ligação iniciada',
  ringing: 'Chamando',
  'in-progress': 'IA em ligação',
  completed: 'Concluída',
  declined: 'Autorização recusada',
  expired: 'Autorização expirada',
  busy: 'Ocupado',
  'no-answer': 'Sem resposta',
  failed: 'Falha',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
  uncertain_call: 'Aguardando confirmação da Twilio',
};
const errors: Record<string,string> = {
  voice_credentials_required: 'Informe o Auth Token da Twilio e a chave OpenAI de voz da empresa.',
  voice_config_invalid: 'Confira os SIDs, o telefone de teste e o perfil de voz.',
  twilio_credentials_rejected: 'A Twilio recusou as credenciais desta conta.',
  twilio_sender_not_online: 'O remetente do WhatsApp ainda não está online na Twilio.',
  twilio_voice_app_required: 'Vincule uma TwiML App ao remetente WhatsApp no Console Twilio.',
  twilio_webhook_required: 'Configure o webhook de mensagens deste remetente como POST com a URL abaixo.',
  twilio_permission_template_invalid: 'Use um template de autorização nativo, da mesma conta Twilio e sem variáveis.',
  twilio_permission_template_not_approved: 'O template de autorização ainda não está aprovado no WhatsApp.',
  voice_openai_model_unavailable: 'A chave da empresa precisa ter acesso ao modelo de voz selecionado.',
  voice_test_phone_must_differ: 'O número de teste precisa ser diferente do remetente Twilio.',
  voice_sender_in_use: 'Esse remetente já está vinculado a outra empresa.',
  voice_contact_daily_limit: 'Já existe um pedido para esse contato nas últimas 24 horas.',
  voice_daily_limit: 'O limite de pedidos de ligação da empresa foi atingido hoje.',
  voice_contact_unavailable: 'Use um contato autorizado e com automação ativa ou configure um número de teste.',
  voice_call_in_progress: 'Aguarde a ligação em andamento antes de editar o perfil.',
  voice_permission_delivery_failed: 'A Twilio informou que não conseguiu entregar a solicitação de autorização.',
  voice_stream_interrupted: 'O áudio da chamada foi interrompido.',
};
const explain = (e: unknown) => e instanceof ApiError ? errors[e.code] ?? describe(e) : describe(e);

function draftFrom(v: Config): Draft {
  return {
    account_sid: v.account_sid ?? '',
    sender_sid: v.sender_sid ?? '',
    template_sid: v.template_sid ?? '',
    test_phone: v.test_phone ?? '',
    profile: v.profile ?? defaultProfile,
  };
}

export default function VoiceConsole({session}: {session: Session}) {
  const [config, setConfig] = useState<Config|null>(null);
  const [draft, setDraft] = useState<Draft|null>(null);
  const [twilio, setTwilio] = useState('');
  const [openai, setOpenai] = useState('');
  const [calls, setCalls] = useState<Call[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [target, setTarget] = useState('');
  const [pending, setPending] = useState<{input: CallInput; key: string}|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operator = session.identity.role !== 'viewer';

  useEffect(() => {
    const cancel = new AbortController();
    request<Config>(base, session, undefined, undefined, cancel.signal).then(v => {
      setConfig(v);
      setDraft(draftFrom(v));
    }).catch(e => { if (!cancel.signal.aborted) setError(explain(e)); });
    return () => cancel.abort();
  }, [session]);

  useEffect(() => {
    if (!config?.available) return;
    const cancel = new AbortController();
    const refresh = () => {
      request<{items: Call[]}>(base+'/calls', session, undefined, undefined, cancel.signal)
        .then(result => setCalls(result.items)).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 4000);
    if (config.enabled && operator) {
      request<{items: Conversation[]}>('/v1/sdr/conversations?limit=100', session, undefined, undefined, cancel.signal)
        .then(result => setConversations(result.items.filter(c => c.channel === 'whatsapp' && c.automation === 'active' && !c.opted_out)))
        .catch(() => {});
    }
    return () => { cancel.abort(); window.clearInterval(timer); };
  }, [config?.available, config?.enabled, operator, session]);

  async function update(action: 'config'|'activate'|'disable') {
    if (!config || !draft) return;
    setBusy(true);
    setError('');
    const body = action === 'config'
      ? {...draft, expected_revision: config.revision, ...(twilio ? {twilio_auth_token: twilio.trim()} : {}), ...(openai ? {openai_api_key: openai.trim()} : {})}
      : {expected_revision: config.revision};
    try {
      const result = await request<Config>(base+'/'+action, session, body, undefined, AbortSignal.timeout(30000));
      setConfig(result);
      setDraft(draftFrom(result));
    } catch (e) {
      setError(explain(e));
    } finally {
      setTwilio('');
      setOpenai('');
      setBusy(false);
    }
  }

  async function call(input: CallInput, key: string = crypto.randomUUID()) {
    setBusy(true);
    setError('');
    setPending({input, key});
    try {
      const item = await request<Call>(base+'/calls', session, input, key);
      setCalls(rows => [item, ...rows.filter(row => row.id !== item.id)].slice(0, 20));
      setPending(null);
    } catch (e) {
      setError(explain(e));
      if (e instanceof ApiError) setPending(null);
    } finally {
      setBusy(false);
    }
  }

  if (config && !config.available) return null;
  if (!config || !draft) return error ? <p role="alert" className="lab-error">{error}</p> : null;
  const profile = draft.profile;
  function setProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft(prev => prev ? {...prev, profile: {...prev.profile, [key]: value}} : prev);
  }
  return <section className="wa-panel" aria-label="Ligações no WhatsApp">
    <div className="wa-section-title"><PhoneCall size={22}/><h2>IA de voz no WhatsApp</h2></div>
    <p role="status">{config.enabled ? `Ativa no remetente ${config.sender}.` : 'Voz desativada nesta empresa.'}</p>
    {config.can_configure && <>
      <p>Use as credenciais Twilio e OpenAI da sua empresa. Elas são salvas no servidor e ficam ocultas após o cadastro.</p>
      <form onSubmit={e => { e.preventDefault(); void update('config'); }}>
        <fieldset disabled={busy}>
          <legend>Credenciais da empresa</legend>
          <label>Account SID (AC)<input required maxLength={34} value={draft.account_sid} onChange={e => setDraft({...draft, account_sid:e.target.value.trim()})}/></label>
          <label>WhatsApp Sender SID (XE)<input required maxLength={34} value={draft.sender_sid} onChange={e => setDraft({...draft, sender_sid:e.target.value.trim()})}/></label>
          <label>Template de autorização (HX)<input required maxLength={34} value={draft.template_sid} onChange={e => setDraft({...draft, template_sid:e.target.value.trim()})}/></label>
          <label>Auth Token Twilio<input type="password" autoComplete="new-password" required={!config.configured} maxLength={64} value={twilio} onChange={e => setTwilio(e.target.value)}/></label>
          <label>Chave OpenAI da empresa para voz<input type="password" autoComplete="new-password" required={!config.configured} maxLength={512} value={openai} onChange={e => setOpenai(e.target.value)}/></label>
          {config.configured && <p className="lab-hint">Preencha os campos de chave somente para substituí-las.</p>}
          <label>Seu número de teste (opcional)<input type="tel" maxLength={16} placeholder="+5511999999999" value={draft.test_phone} onChange={e => setDraft({...draft, test_phone:e.target.value.trim()})}/></label>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Perfil da IA de voz</legend>
          <label>Nome<input required maxLength={80} value={profile.name} onChange={e => setProfile('name', e.target.value)}/></label>
          <label>Abertura<textarea required rows={2} maxLength={400} value={profile.greeting} onChange={e => setProfile('greeting', e.target.value)}/></label>
          <label>Instruções<textarea required rows={4} maxLength={4000} value={profile.instructions} onChange={e => setProfile('instructions', e.target.value)}/></label>
          <label>Modelo<select value={profile.model} onChange={e => setProfile('model', e.target.value)}>
            <option value="gpt-realtime-mini">GPT Realtime Mini</option><option value="gpt-realtime">GPT Realtime</option>
          </select></label>
          <label>Voz<select value={profile.voice} onChange={e => setProfile('voice', e.target.value)}>
            {['marin','cedar','alloy','coral','sage','verse'].map(v => <option key={v} value={v}>{v}</option>)}
          </select></label>
          <label>Duração máxima (segundos)<input type="number" required min={30} max={300} value={profile.max_seconds} onChange={e => setProfile('max_seconds', Number(e.target.value))}/></label>
        </fieldset>
        <p className="lab-hint">Ao salvar alterações, valide o remetente novamente para liberar as chamadas.</p>
        <Button type="submit" disabled={busy}>Salvar configuração</Button>
      </form>
      {config.configured && <>
        <p>No Console Twilio, associe uma TwiML App ao remetente WhatsApp. Configure estas URLs como POST.</p>
        <label>Webhook de mensagens<input readOnly value={config.messaging_webhook} onFocus={e => e.target.select()}/></label>
        <label>Voice Request URL da TwiML App<input readOnly value={config.voice_webhook} onFocus={e => e.target.select()}/></label>
        <div className="wa-options">
          {config.enabled
            ? <Button variant="outline" disabled={busy} onClick={() => void update('disable')}>Desativar ligações</Button>
            : <Button disabled={busy} onClick={() => void update('activate')}>Validar e ativar ligações</Button>}
        </div>
      </>}
    </>}
    {config.enabled && operator && <>
      <p>A ligação só entra na fila quando o contato aceita o pedido no WhatsApp ou quando a Twilio confirma uma permissão permanente.</p>
      {pending
        ? <Button disabled={busy} onClick={() => void call(pending.input,pending.key)}>Conferir a mesma solicitação</Button>
        : <div className="wa-options">
          {config.can_configure && config.test_phone && <Button variant="outline" disabled={busy} onClick={() => void call({test:true})}>Solicitar ligação de teste</Button>}
          <label>Conversa autorizada<select value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Escolha um contato</option>
            {conversations.map(c => <option key={c.id} value={c.id}>{c.label || 'Contato do WhatsApp'}</option>)}
          </select></label>
          <Button disabled={!target || busy} onClick={() => void call({conversation_id:target})}>Solicitar ligação</Button>
        </div>}
    </>}
    {error && <p role="alert" className="lab-error">{error}</p>}
    {calls.length > 0 && <><h3>Ligações recentes</h3><ul>
      {calls.map(c => <li key={c.id}>{new Date(c.created_at).toLocaleString('pt-BR')} · {labels[c.status] ?? c.status}
        {c.error_code && ` · ${errors[c.error_code] ?? c.error_code}`}</li>)}
    </ul></>}
  </section>;
}
