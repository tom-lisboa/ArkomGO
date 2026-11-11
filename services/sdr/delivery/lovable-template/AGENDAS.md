# Worker de agenda · etapa candidata 0.13

Implementado na plataforma nova, com testes locais e provedores simulados. **Não foi implantado no servidor. Não foram acessados Google Calendar, OpenAI ou WhatsApp reais nesta validação.** O SDR Go oficial, a Lumi original, o Supabase atual e o ZIP 0.11.1 dos testadores permanecem fora desta mudança.

## O que o cliente controla

- Criação de agendas próprias e associação de agendas de várias contas Google.
- Fuso IANA, faixas semanais, datas bloqueadas, durações, intervalo da grade, antecedência mínima, horizonte de agendamento e intervalos antes/depois da reunião.
- Ativação de cada agenda; permissões específicas de consultar, reservar, remarcar e cancelar para o SDR e para cada fluxo publicado.
- Aprovação humana antes de mudanças ou execução automática conforme suas regras. A tela de referência cria agendas com aprovação ligada e permissões de agente desligadas.
- Personalização de telas e fluxos pelo Lovable, usando os contratos públicos e `src/calendar-api.ts`. A tela de referência não limita as combinações que o cliente pode criar com essas capacidades.

Agendas e dados pertencem à empresa identificada pela sessão. Configuração, conexão Google e aprovação exigem administrador. Operador pode consultar e solicitar operações; consulta não altera. O pedido HTTP não aceita uma empresa ou identidade de agente escolhida pelo navegador. O SDR usa `sdr`; uma ferramenta de fluxo usa `workflow:<id-do-fluxo>`, atribuído pelo backend.

## Fluxo e confirmações

1. O cliente autoriza uma agenda para o agente e publica seus fluxos. A agenda não entra automaticamente nas ferramentas do SDR por existir.
2. O worker de contexto inclui somente agendas permitidas, as opções reais recentes e as reservas deste contato. Não inclui títulos de reuniões de outros contatos, tokens ou códigos de login.
3. O executor com SDK Go recebe uma intenção estruturada. Uma reserva exige referência a uma opção devolvida pelo worker e escolha explícita na mensagem atual. Referências inventadas, perguntas/negações e escolhas ambíguas são rejeitadas pelos controles determinísticos. Essa checagem não equivale a uma compreensão semântica perfeita; a aprovação humana continua configurável.
4. A API grava um pedido durável e retém a vaga localmente enquanto ele aguarda processamento/aprovação. A IA informa recebimento do pedido, não uma confirmação antecipada.
5. O processo **`-worker=calendar`**, com credencial própria, consulta disponibilidade e revalida autorização antes de alterar. A agenda própria é confirmada em transação do banco exclusivo da plataforma. O Google é alterado pelo adaptador HTTP após autorização interna.
6. Apenas o resultado efetivo confirma, remarca ou cancela a reserva no nosso registro. O atendimento recebe um texto de resultado sem outra chamada ao modelo, somente se a conversa continua autorizada e atual. Uma pausa impede novas autorizações; uma chamada externa já autorizada pode concluir. Nesse caso o registro externo é preservado e marcado para conferência, sem retomar o atendimento.

`confirmed` significa reserva registrada; `queued` e `waiting_approval` ainda não são reservas confirmadas. O envio da mensagem de confirmação também respeita as permissões e o transporte WhatsApp existentes.

## Várias agendas

`any` encontra alternativas em qualquer agenda selecionada. `all` exige que o horário passe pelas regras e pela disponibilidade de todas as selecionadas. **A reserva cria um evento na agenda indicada na opção, não um evento em cada agenda comparada.** Convites para equipe ou reserva atômica de múltiplos recursos não fazem parte desta etapa.

Os horários são gerados no servidor, com deslocamento e fuso explícitos. A duração é real, inclusive em mudanças de horário de verão. Janelas locais inexistentes em uma transição de fuso são recusadas em vez de deslocadas silenciosamente. Cada faixa é do mesmo dia; `end_minute: 1440` representa a meia-noite seguinte. Turnos que atravessam a noite podem ser divididos em duas faixas.

A consulta não garante a vaga: a disponibilidade é conferida outra vez ao reservar. A plataforma impede concorrência e duplicidade dos próprios pedidos. O Google não oferece uma transação que una consulta de disponibilidade e inserção; outra pessoa ou sistema externo ainda pode inserir um evento nesse intervalo. Não há promessa de exclusividade global contra edições externas.

Remarcação/cancelamento se aplicam às reservas gerenciadas pela nossa plataforma, não a eventos arbitrários da conta Google. Remarcação conserva a reserva anterior até concluir a nova. Para consultar opções que podem sobrepor a reserva atual, informe `booking_id` e `expected_revision` na consulta.

## Contratos para personalização

Prefixo público: `/sdr-next`. Todas as rotas abaixo exigem a sessão do usuário:

- `GET /v1/sdr/calendar/capabilities`: disponibilidade da função e da configuração Google.
- `GET|POST /v1/sdr/calendar/calendars`: listar/criar agenda própria.
- `POST /v1/sdr/calendar/calendars/{id}`: salvar regras, permissões e ativação com revisão esperada e `Idempotency-Key`.
- `GET /v1/sdr/calendar/connections`: conexões Google da empresa, sem credenciais.
- `GET /v1/sdr/calendar/bookings`: reservas gerenciadas da empresa e horário da última confirmação.
- `GET|POST /v1/sdr/calendar/requests`: listar/solicitar operações. Criação exige `Idempotency-Key`.
- `GET /v1/sdr/calendar/requests/{id}`: acompanhar o resultado.
- `POST /v1/sdr/calendar/requests/{id}/actions`: `approve`, `cancel` ou `reconcile` conforme perfil e estado.
- `POST /v1/sdr/calendar/google/authorize`: iniciar conexão com `{label, mode: "read"|"write"}`.
- `GET /v1/sdr/calendar/google/{id}/calendars`: listar agendas acessíveis na conta autorizada.
- `POST /v1/sdr/calendar/google/{id}/attach`: associar uma agenda selecionada e suas regras.
- `POST /v1/sdr/calendar/google/{id}/disconnect`: desabilitar uso futuro e remover as credenciais locais. Eventos já criados continuam na conta Google. A revogação da autorização do aplicativo no Google é uma ação distinta.

Exemplo de consulta:

```json
{
  "kind": "availability",
  "calendar_ids": ["ID_RECEBIDO_DA_API"],
  "mode": "any",
  "from": "2026-11-10T09:00:00-04:00",
  "to": "2026-11-10T18:00:00-04:00",
  "duration_minutes": 30,
  "conversation_id": "CONVERSA_DA_EMPRESA"
}
```

Datas são exemplos. Para reservar, envie `kind: "book"`, `availability_id` e `slot_id` realmente retornados. Não gere IDs ou horários no navegador. Preserve corpo e chave para confirmar um pedido incerto. O cliente pode montar seus formulários e seus agentes com o SDK de interface.

Ferramentas de fluxo: `calendar.availability`, `calendar.book`, `calendar.reschedule` e `calendar.cancel`. A conclusão de uma etapa confirma **enfileiramento**, com `request_id`, não o resultado da agenda. A integração deve acompanhar a rota do pedido antes de apresentar sucesso. Preview não cria pedidos nem chama Google.

## Preparar o Google depois

O usuário informou que ainda não existe um projeto OAuth dedicado. A implementação fica pronta para essa configuração, sem buscar ou reutilizar credenciais da operação original.

1. Definir um domínio HTTPS para a API nova, ajustar a origem permitida da interface e o endereço da API usado pelo frontend para esse domínio. O Google não aceita o IP público atual como retorno OAuth de aplicação web em produção.
2. No projeto Google Cloud próprio da plataforma, habilitar Calendar API, configurar a tela de consentimento e um cliente OAuth do tipo aplicação web. Registrar exatamente `https://SEU-DOMINIO/sdr-next/v1/sdr/calendar/google/callback`.
3. Guardar no servidor um arquivo privado com `client_id`, `client_secret` e `redirect_uri`. Apontar `SDR_GOOGLE_CALENDAR_CONFIG_FILE` para esse arquivo. Esses valores não vão ao Lovable.
4. Criar uma chave exclusiva de 32 bytes aleatórios, em Base64, num arquivo privado indicado por `SDR_GOOGLE_CALENDAR_KEY_FILE`. Guardar cópia segura separada: perder essa chave exige reconectar as contas. Não reutilizar a chave de outra instalação.
5. Atualizar API, contexto e execução da plataforma nova para a mesma versão 0.13 antes de ativar a agenda. Na API nova, habilitar `SDR_CALENDAR_ENABLED=true` e a infraestrutura privada de workers existente. Criar `calendar-worker` exclusivo e montá-lo na API e no novo processo `-worker=calendar`. O worker de agenda não recebe a chave OpenAI, o segredo OAuth do aplicativo ou a chave de criptografia.
6. O cliente toca em Entrar com Google em uma janela normal do navegador. O host da interface deve permitir esse formulário para o domínio de retorno e a navegação Google; isso faz parte da homologação no Lovable. O fluxo começa por formulário POST da origem Lovable autorizada, com ticket efêmero e a sessão atual no corpo; não usa sessão/ticket na URL. Em seguida usa `state` de uso único, PKCE e cookie seguro vinculado ao navegador. Uma URL compartilhada não inicia a conexão em outro navegador. O retorno também exige que a sessão iniciadora continue válida. Depois seleciona suas agendas e define as permissões.

Modo leitura solicita listagem de agendas e disponibilidade. Modo gestão acrescenta permissão de eventos. Seleção de uma agenda não concede mais direitos do que o usuário já tem nela no Google. Conexões e tokens ficam vinculados à empresa; os tokens são cifrados com AES-GCM e vínculo à empresa/conexão. Renovação ocorre no servidor; somente acesso de curta duração é fornecido ao worker interno autorizado para aquele pedido. Credenciais e fluxo OAuth não entram no GraphQL nem no ZIP de dados.

O cadastro do aplicativo e sua disponibilidade para usuários externos dependem da configuração/publicação que o Google exigir para o projeto. Esta etapa não afirma que a autorização real ou a homologação Google estão concluídas.

## Falhas, métricas e portabilidade

Falha de consulta não vira uma lista de horários livres. Eventos têm identificador determinístico por reserva. Repetição de confirmação não cria outro evento. Remarcação/cancelamento Google usam versão (`ETag`/`If-Match`) para impedir sobrescrever uma alteração externa desconhecida.

Timeout depois de possível escrita gera `uncertain`, preservando a pendência. O administrador usa Conferir resultado: o worker consulta o mesmo identificador, sem repetir a escrita. Estado ainda incerto exige conferência; não há reenvio cego. Desativar agenda ou revogar permissão invalida pedidos que ainda não começaram o efeito.

O worker publica os mesmos metadados de acionamento/resultado dos demais, incluindo vínculos execução → agenda e consulta → reserva. Não copia títulos, telefones ou credenciais para o monitor. Agendas, conexões públicas, pedidos e reservas entram nas coleções `calendars`, `calendar_connections`, `calendar_requests` e `calendar_bookings` do GraphQL/exportação da empresa.

Limites do piloto: até 16 agendas e oito conexões por empresa; oito agendas por consulta; até 31 dias consultados e 200 opções por resultado (com sinalização do limite); até mil pedidos conservados por empresa, vinte pendentes não expirados, três tentativas e posse de 90 segundos. Pedido/aprovação expira em 15 minutos; opção de consulta em dez. Guardar disponibilidade não é arquivar todo o histórico da conta Google. O banco e o provisionamento continuam sendo os do piloto, sem comprovação de escala de produção.

Recorrência, capacidade maior que um por agenda, distribuição automática de responsáveis, Google Meet, convites a participantes, notificações/lembretes e sincronização contínua de alterações externas não foram implementados nesta etapa. Os adaptadores e contratos permitem evoluir essas capacidades sem levar credenciais ou processamento para a cópia do cliente.

Referências oficiais: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [escopos](https://developers.google.com/workspace/calendar/api/auth), [disponibilidade](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [inserção de eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [controle de versão](https://developers.google.com/workspace/calendar/api/guides/version-resources) e [saídas estruturadas da OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
