import type {Session} from './runtime/api';
import CalendarConsole from './runtime/CalendarConsole';

export default function CalendarAgent({session}:{session:Session}) {
 const company=session.identity.organization_id==='org_demo_alfa'?'Alfa Demonstração':
  session.identity.organization_id==='org_demo_beta'?'Beta Demonstração':'Minha empresa';
 return <div className="agenda-agent">
  <header className="agenda-agent-masthead">
   <span className="agenda-agent-brand" aria-label="Arkom">ARK<span>O</span>M</span>
   <div className="agenda-agent-identity"><strong>Lia</strong><span>Agenda e agendamentos</span></div>
   <p>{company}<small>Agenda própria · ambiente local</small></p>
  </header>
  <CalendarConsole session={session} agentMode/>
 </div>;
}
