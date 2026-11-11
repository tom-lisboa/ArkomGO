const perfil='/demo-assets/perfil-voz.webp';
const autorizacao='/demo-assets/autorizacao-whatsapp.webp';
const conversas='/demo-assets/conversas.webp';
const controle='/demo-assets/controle-equipe.webp';
const agenda='/demo-assets/agendamento.webp';
const horarios='/demo-assets/agendamento-horarios.webp';
const followUp='/demo-assets/follow-up.webp';
const whatsapp='/demo-assets/atendimento-whatsapp.webp';

export type Capture = { image: string; alt: string; caption: string; source?: string };
type Sheet = {
  id: string;
  album: 'skills' | 'profissoes';
  title: string;
  summary: string;
  note: string;
  steps: { title: string; detail: string }[];
  captures: Capture[];
  recipe: string;
  prompt: string;
};

export const albums = [
  { id: 'skills', title: 'Skills', cover: [whatsapp, agenda] },
  { id: 'profissoes', title: 'Profissões', cover: [controle, conversas] },
] as const;

export const sheets: Sheet[] = [
  {
    id: 'ligacao-ia',
    album: 'skills',
    title: 'Ligação por IA',
    summary: 'Converse por voz no WhatsApp com uma IA que segue as instruções da sua empresa.',
    steps: [
      { title: 'Sua empresa define o perfil', detail: 'Escolhe a saudação, a voz, a duração máxima e os assuntos que a IA pode tratar.' },
      { title: 'O contato controla o aceite', detail: 'O WhatsApp pede autorização. A IA pode ligar se o contato aceitar ou se já houver permissão permanente confirmada.' },
      { title: 'Sua equipe acompanha o resultado', detail: 'Veja se a ligação foi concluída, recusada, expirou ou falhou. A equipe pode assumir a conversa quando necessário.' },
    ],
    note: 'No piloto, a equipe inicia a solicitação pelo painel. A IA pode aproveitar mensagens recentes quando a chamada parte de uma conversa autorizada.',
    captures: [
      { image: autorizacao, alt: 'Três telas do WhatsApp mostrando o pedido de autorização, as opções de resposta e o aceite', caption: 'Twilio · exemplo real da autorização no WhatsApp', source: 'https://www.twilio.com/docs/voice/whatsapp-business-calling#business-initiated-call-permission-and-consent' },
      { image: perfil, alt: 'Tela do piloto com saudação, instruções, voz, modelo e duração da ligação', caption: 'SDR Arkom · perfil de voz no piloto' },
    ],
    recipe: 'ligacao-ia.md',
    prompt: 'Use a ficha Ligação por IA do álbum de Skills. Monte uma tela simples com saudação, voz, teste no meu WhatsApp e status da ligação, usando o backend Arkom.',
  },
  {
    id: 'agendamento',
    album: 'skills',
    title: 'Agendamento',
    summary: 'Consulte horários, reserve uma opção e acompanhe remarcações e cancelamentos pelo SDR.',
    steps: [
      { title: 'Escolha as agendas', detail: 'Defina fuso, duração e as permissões que o SDR pode usar em cada agenda.' },
      { title: 'Consulte os horários', detail: 'O backend calcula as opções a partir da agenda e das regras da empresa.' },
      { title: 'Acompanhe a reserva', detail: 'A tela distingue pedido na fila, aprovação pendente e reserva confirmada.' },
    ],
    note: 'Tela do SDR em homologação. A agenda precisa estar habilitada no ambiente da empresa para operar.',
    captures: [
      { image: agenda, alt: 'Painel de agendas com uma agenda própria habilitada e opção de consultar horários', caption: 'SDR Arkom · agenda própria em homologação' },
      { image: horarios, alt: 'Opções de horário retornadas para a agenda comercial em uma consulta de teste', caption: 'SDR Arkom · horários devolvidos pelo worker em teste' },
    ],
    recipe: 'agendamento.md',
    prompt: 'Monte um painel de agendamento com consulta de horários, confirmação, remarcação e cancelamento. Use o backend Arkom e verifique se a agenda está habilitada antes de oferecer essas ações.',
  },
  {
    id: 'follow-up',
    album: 'skills',
    title: 'Follow-up',
    summary: 'Programe o envio de uma apresentação ou outro arquivo pelo WhatsApp depois do primeiro contato.',
    steps: [
      { title: 'Escolha a conversa e a mídia', detail: 'Use um contato autorizado e um arquivo preparado na conta da empresa.' },
      { title: 'Defina a hora e a aprovação', detail: 'Escolha quando o pedido entra em processamento e se a equipe precisa aprovar a etapa.' },
      { title: 'Acompanhe o envio', detail: 'Veja a execução, as ações disponíveis e a confirmação de envio pelo WhatsApp.' },
    ],
    note: 'Esta ficha usa o follow-up com mídia programada do SDR produto. As cadências de lembretes, SMS e voz da Bia interna pertencem a outra integração.',
    captures: [
      { image: followUp, alt: 'Painel real de execuções com o pedido Follow-up de apresentação na fila e opções para cancelar e pausar', caption: 'SDR Arkom · pedido programado na fila de teste' },
    ],
    recipe: 'follow-up.md',
    prompt: 'Monte uma tela para programar um follow-up com mídia. Quero escolher conversa, arquivo e horário, acompanhar a execução e ver o estado da entrega. Use o motor de execuções do backend Arkom.',
  },
  {
    id: 'atendimento-whatsapp',
    album: 'skills',
    title: 'Atendimento no WhatsApp',
    summary: 'Conecte seu WhatsApp, acompanhe as conversas e deixe a equipe assumir quando precisar.',
    steps: [
      { title: 'Conecte o número', detail: 'Pareie pelo QR ou código e autorize os contatos que participarão do piloto.' },
      { title: 'Acompanhe o atendimento', detail: 'Consulte o histórico e veja quando a automação está ativa ou a conversa está com a equipe.' },
      { title: 'Assuma a conversa', detail: 'Pause, assuma ou retome pelo painel conforme as permissões da empresa.' },
    ],
    note: 'As imagens mostram o pareamento e o painel de conversas com dados de demonstração.',
    captures: [
      { image: whatsapp, alt: 'Tela de conexão do SDR com as opções QR Code e código pelo número, antes de emitir um código', caption: 'SDR Arkom · conexão do número de WhatsApp' },
      { image: conversas, alt: 'Histórico do SDR com conversa fictícia e controles de atendimento humano', caption: 'SDR Arkom · conversa de demonstração e controle da equipe' },
    ],
    recipe: 'atendimento-whatsapp.md',
    prompt: 'Monte meu painel de WhatsApp com conexão do número, contatos autorizados e histórico. Quero poder pausar, assumir e retomar conversas pelo backend Arkom.',
  },
  {
    id: 'clinica',
    album: 'profissoes',
    title: 'Clínica',
    summary: 'Use a voz para confirmar consultas e avisar a recepção quando alguém precisar remarcar.',
    steps: [
      { title: 'Confirme com o mínimo de informação', detail: 'Use o primeiro nome e o horário de um agendamento já verificado. Sem horário confirmado, encaminhe para a recepção.' },
      { title: 'Deixe a recepção cuidar das mudanças', detail: 'A IA pode identificar um pedido de remarcação e orientar o contato a seguir pelo atendimento da clínica.' },
      { title: 'Separe atendimento de saúde e recepção', detail: 'Oriente a IA a tratar só de logística. Perguntas sobre sintomas, exames e tratamentos seguem para a equipe responsável.' },
    ],
    note: 'Aplicação sugerida. A habilidade de voz trata da conversa. Consulta, remarcação e registro de presença dependem de uma integração de agenda habilitada.',
    captures: [
      { image: controle, alt: 'Painel real do SDR com os controles de assumir, pausar e retomar o atendimento', caption: 'SDR Arkom · controles da equipe em uma demonstração' },
    ],
    recipe: 'clinica.md',
    prompt: 'Use o playbook Clínica com a skill Ligação por IA. Monte uma tela de confirmação de consultas com saudação editável, ligação de teste e acompanhamento pela recepção. Use o backend Arkom e consulte a disponibilidade real das integrações.',
  },
  {
    id: 'advocacia',
    album: 'profissoes',
    title: 'Advocacia',
    summary: 'Organize o primeiro contato e confirme o horário de uma conversa com o escritório.',
    steps: [
      { title: 'Faça uma triagem administrativa', detail: 'Confirme como chamar a pessoa e identifique se ela quer falar sobre um primeiro atendimento ou retornar um contato.' },
      { title: 'Use somente dados verificados', detail: 'Se o horário estiver no contexto validado, confirme data e hora. Em caso de dúvida, peça apoio da equipe.' },
      { title: 'Encaminhe o assunto ao escritório', detail: 'Perguntas sobre estratégia, prazos e documentos ficam com a equipe. A IA mantém a conversa focada no próximo contato.' },
    ],
    note: 'Aplicação sugerida. O painel de ligações registra o andamento técnico da chamada. Confirmações de reunião e decisões do escritório seguem o fluxo da equipe.',
    captures: [
      { image: conversas, alt: 'Painel real do SDR com conversa fictícia e área de controle humano', caption: 'SDR Arkom · histórico e controle humano com dados fictícios' },
    ],
    recipe: 'advocacia.md',
    prompt: 'Use o playbook Advocacia com a skill Ligação por IA. Monte uma tela de primeiro contato e confirmação de horário, com teste no meu número, status da ligação e acesso ao controle humano. Use o backend Arkom.',
  },
];
