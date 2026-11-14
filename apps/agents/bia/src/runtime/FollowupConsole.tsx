import {useEffect, useState} from 'react';
import {Button} from './components/Button';
import {ApiError, describe, request, type Conversation, type Session} from './api';

type Followup = {
  id: string;
  conversation_id: string;
  text: string;
  due_at: string;
  status: string;
  reason?: string;
};
type Queue = {online: boolean; items: Followup[]};

const route = '/v1/sdr/followups';
const labels: Record<string,string> = {
  scheduled: 'Agendado', queued: 'Na fila', sending: 'Em envio', sent: 'Enviado',
  cancelled: 'Cancelado', expired: 'Expirado', uncertain: 'Envio não confirmado',
};
const errors: Record<string,string> = {
  followup_invalid: 'Informe uma data futura de até sete dias e uma mensagem de até 1.000 caracteres.',
  followup_unavailable: 'Selecione uma conversa ativa, sem bloqueio de automação e com contexto publicado.',
  followup_outside_window: 'Confira a autorização do contato e escolha um horário dentro da janela da conversa.',
  followup_already_scheduled: 'Esta conversa já tem um follow-up agendado.',
  followup_already_processed: 'O envio já começou ou foi concluído. Atualize a fila.',
};
const reasons: Record<string,string> = {
  conversation_changed:'A conversa recebeu uma resposta ou mudou de estado.',
  business_changed:'O contexto publicado da empresa mudou.',
  whatsapp_window_closed:'A janela de atendimento ou a autorização do contato terminou.',
  schedule_expired:'O prazo de envio terminou.',
  operator_cancelled:'Cancelado pela equipe.',
};

export default function FollowupConsole({session}: {session: Session}) {
  const [queue, setQueue] = useState<Queue|null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const operator = session.identity.role !== 'viewer';

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void request<Queue>(route,session,undefined,undefined,controller.signal)
      .then(setQueue).catch(e => {if (!controller.signal.aborted) setError(describe(e));});
    refresh();
    void request<{items:Conversation[]}>('/v1/sdr/conversations?limit=100',session,undefined,undefined,controller.signal)
      .then(r => setConversations(r.items)).catch(e => {if (!controller.signal.aborted) setError(describe(e));});
    const timer = window.setInterval(() => {if (!document.hidden) refresh();},5000);
    return () => {controller.abort(); window.clearInterval(timer);};
  },[session]);

  async function submit(action: 'schedule'|'cancel', id?: string) {
    setBusy(true);
    setError('');
    try {
      if (action === 'schedule') {
        await request(route,session,{conversation_id:conversation,text,due_at:new Date(date).toISOString()},key);
        setText('');
        setKey(crypto.randomUUID());
      } else {
        await request(route+'/'+id+'/cancel',session,{});
      }
      setQueue(await request<Queue>(route,session));
    } catch(e) {
      setError(e instanceof ApiError ? errors[e.code] ?? describe(e) : describe(e));
    } finally {
      setBusy(false);
    }
  }

  return <main className="wa-workspace">
    <section className="wa-panel">
      <h1 className="text-h2">Follow-up</h1>
      <p>Agende uma retomada para uma conversa. A fila cancela o envio se o contato responder ou a equipe interromper a automação.</p>
      {queue && !queue.online && <p role="status">O worker está retomando a conexão com a fila.</p>}
      {operator && <form onSubmit={e => {e.preventDefault(); void submit('schedule');}}>
        <fieldset disabled={busy}>
          <label>Conversa<select required value={conversation} onChange={e => {setConversation(e.target.value);setKey(crypto.randomUUID());}}>
            <option value="">Escolha a conversa</option>
            {conversations.filter(c => c.automation === 'active' && !c.opted_out).map(c =>
              <option key={c.id} value={c.id}>{c.label || 'Conversa'} · {c.channel === 'whatsapp' ? 'WhatsApp' : 'Simulação'}</option>)}
          </select></label>
          <label>Data e hora no seu navegador<input type="datetime-local" required value={date}
            onChange={e => {setDate(e.target.value);setKey(crypto.randomUUID());}}/></label>
          <label>Mensagem de follow-up<textarea required rows={3} maxLength={1000} value={text}
            onChange={e => {setText(e.target.value);setKey(crypto.randomUUID());}}/></label>
          <Button type="submit" disabled={busy || !conversation || !date || !text.trim()}>Agendar follow-up</Button>
        </fieldset>
      </form>}
      {error && <p role="alert" className="lab-error">{error}</p>}
    </section>
    <section className="wa-panel">
      <h2>Retomadas da sua empresa</h2>
      {queue?.items.length === 0 && <p>Nenhum follow-up agendado.</p>}
      {queue?.items.map(item => <article key={item.id} className="core-card">
        <strong>{labels[item.status] ?? item.status}</strong>
        <p>{new Date(item.due_at).toLocaleString('pt-BR')} · {conversations.find(c => c.id === item.conversation_id)?.label || 'Conversa'}</p>
        <p>{item.text}</p>
        {item.reason && <p className="lab-hint">{reasons[item.reason]}</p>}
        {operator && ['scheduled','queued'].includes(item.status) &&
          <Button variant="outline" disabled={busy} onClick={() => void submit('cancel',item.id)}>Cancelar follow-up</Button>}
      </article>)}
    </section>
  </main>;
}
