# Contratos e operação

## Entrada HTTP

O [webhook de produção da Bia](production-form-webhook.md) recebe novos leads da página com uma chave exclusiva de cadastro e coloca o primeiro contato na fila do SDR.

Todos os caminhos `/v1` exigem `Authorization: Bearer <BIA_API_TOKEN>`. São contratos internos entre backends. O site público deve autenticar/proteger sua própria entrada e encaminhar ao serviço; não existe verificação de assinatura de Meta/ClickMax diretamente nestes endpoints.

`POST /v1/forms`: corpo em `examples/form.json`, com `Idempotency-Key` obrigatório. A chave repetida com o mesmo conteúdo não duplica a execução; conteúdo diferente retorna 409. O telefone é normalizado para E.164 antes da identidade estável do lead.

`POST /v1/events`:

```json
{
  "id": "message-provider-unique-id",
  "kind": "message.received",
  "lead_id": "lead_id_retornado_pelo_formulario",
  "at": "2026-10-27T14:00:00-04:00",
  "text": "Quero ver os horários"
}
```

Tipos: `form.submitted`, `message.received`, `schedule.preference`, `booking.created`, `booking.rescheduled`, `booking.cancelled`, `attendance.attended`, `attendance.no_show`, `contact.opt_out`, `human.takeover`, `human.release`, `cadence.resume`, `ownership.changed`.

Campos adicionais: `preference` para preferência; `booking` para reserva criada/remarcada; `booking_id` para cancelamento/presença; `owner` (`go`, `n8n`, `shadow`) para propriedade. `selected_slot_id` representa uma escolha explícita no site. Mensagens recebidas precisam de texto, seleção ou `audio_url`. Datas futuras acima de cinco minutos são recusadas para eventos; datas de reserva podem ser futuras.

Histórico de outra plataforma não é importado automaticamente. Antes de qualquer corte é necessário mapear contatos, reservas, opt-out e controle humano. Não reenvie eventos de simulação para “ativar” contatos.

## Agenda e CRM locais

A implementação ativa de calendário é `LocalCalendar`. `POST /v1/slots` cria vagas, sem integração externa. A publicação bloqueia sobreposição por closer. A reserva bloqueia a vaga e impede duas reservas ativas para o mesmo lead; remarcação e cancelamento são transacionais. O CRM local grava notas/tarefas em `bia_go.crm_notes`, com idempotência.

Não há envio de e-mail, criação de Meet, leitura do calendário pessoal do closer ou operação de sessões coletivas. No calendário local a capacidade é uma pessoa por vaga. Eventos de presença devem vir de uma fonte confiável ou de um operador autenticado.

## Gateway futuro de mensagens

O executável só habilita mensagens externas quando configurado com `BIA_GATEWAY_URL`. Essa URL **não é uma API já existente**: o contrato abaixo precisa ser implementado/homologado para o provedor escolhido.

`POST /messages`, `Authorization: Bearer <BIA_GATEWAY_TOKEN>` e `Idempotency-Key: <id da ação>`:

```json
{
  "lead_id": "lead_...",
  "contact": {"name":"Pessoa Exemplo","phone":"+5565999999999","channel":"gateway"},
  "text": "Mensagem da Bia",
  "purpose": "welcome",
  "requires_template": true
}
```

Resposta: `{"id":"id_confirmado_pelo_provedor","status":"accepted"}` ou `sent`. O gateway deve persistir a idempotência antes de repetir qualquer tentativa. Uma resposta 2xx sem recibo não significa envio confirmado. `requires_template` sinaliza que o serviço não dispõe de uma mensagem recebida nas últimas 23 horas; o gateway precisa resolver e validar o template aprovado, consentimento e regras do canal. Primeiro contato por formulário não abre automaticamente uma conversa de WhatsApp.

O adaptador de mensagens não deve aceitar um texto arbitrário como template só porque esse campo é verdadeiro. Mapeie `purpose` para templates aprovados e parâmetros validados. Sem template compatível, recuse com erro explícito e encaminhe para revisão.

Os adaptadores de referência de DataCrazy e ClickMax reproduzem partes dos envelopes encontrados no export. **Não estão ligados no executável**, não foram exercitados ao vivo e não resolvem primeiro contato fora de uma sessão aberta. O envio ClickMax usa `turno_id` estável; DataCrazy trata recibo desconhecido como operação incerta. O adaptador Cal é parcial, inclusive cancelamento deliberadamente indisponível sem contrato verificado. Esses adaptadores não são uma declaração de paridade com a produção.

### Cards do CRM ClickMax

O SDR interno pode sincronizar a etapa de uma oportunidade existente pela [API pública do ClickMax](https://docs.clickmax.io/api-reference). O serviço usa uma chave Bearer própria do workspace. A conexão MCP usa OAuth pelo navegador e é independente da integração em Go.

1. Salve `BIA_CLICKMAX_API_KEY` no ambiente privado. O comando `bia -clickmax-list-pipelines` lê essa variável e lista IDs, nomes e etapas. Em uma instância com a chave configurada, um administrador também pode consultar `GET /v1/management/integrations/clickmax/pipelines`.
2. Configure `BIA_CLICKMAX_PIPELINE_ID` com o UUID do quadro e `BIA_CLICKMAX_STAGE_MAP` com um objeto JSON que mapeia as etapas do SDR para os UUIDs das colunas. Por exemplo, `{"booked":"UUID_DA_COLUNA_AGENDADO","presence_confirmed":"UUID_DA_COLUNA_CONFIRMADO"}`. Use IDs reais retornados pela API. Ative `BIA_CLICKMAX_SYNC_ENABLED=true` quando o mapa estiver definido.
3. Vincule a oportunidade em `PUT /v1/management/leads/{id}/integrations/clickmax`, com o Bearer do administrador e `{"card_id":"UUID_DA_OPORTUNIDADE"}`. O servidor verifica o pipeline, o estado aberto do card e o contato associado. A sincronização usa a etapa atual do SDR após o vínculo. Consulte o mesmo caminho com `GET` para ver o estado do vínculo e eventuais erros.

As etapas disponíveis são `contact_pending`, `contacted`, `attempt_2`, `attempt_3`, `engaged`, `scheduling`, `booked`, `presence_confirmed`, `in_meeting`, `awaiting_attendance`, `attended`, `no_show` e `cancelled`. Etapas sem mapeamento mantêm o card na coluna atual. O worker opera em leads abertos sob automação ativa da Bia. Ele grava a tentativa, consulta o card antes de repetir e pausa o vínculo se detectar outra movimentação no ClickMax. Um administrador pode conferir o card e gravar o vínculo novamente para retomar.

#### Quadro SDR · ARKOM

O mapa de produção está em `.local/clickmax/sdr-arkom-map.json`. O corte em `BIA_CLICKMAX_AUTO_LINK_SINCE` inclui cadastros e novas mensagens recebidos pela Bia a partir desse horário. A Bia busca um contato único por telefone, incluindo a variante brasileira do WhatsApp. Quando há duplicidade, usa o e-mail para desambiguar. Ela reaproveita uma única oportunidade aberta desse contato no quadro ou cria uma em **Novo Lead** quando ele ainda não tem oportunidade no quadro. Leads sem contato no ClickMax, contatos ambíguos e cards encerrados ficam para revisão. O motivo aparece como `intake_error` no endpoint de status.

| Etapa no ClickMax | Sinal da Bia |
| --- | --- |
| Novo Lead | Entrada recebida |
| Tentativa 1 | Primeiro contato registrado |
| Tentativa 2 e Tentativa 3 | Primeiro e segundo follow-ups sem resposta enviados |
| Conectado | Resposta do lead |
| Buscando Horário | Bia consulta ou oferece horários |
| Reunião Agendada | Reserva confirmada, após gravar data e horário no card |
| Reagendamento | Falta registrada em uma reunião agendada |
| Perdido | Encerramento pela equipe com Motivo de Perdido |

Um card vinculado automaticamente só retrocede quando a equipe registra uma falta e ele passa de **Reunião Agendada** para **Reagendamento**. Comparecimento e cancelamento ficam registrados no SDR. A entrada e a saída de uma coluna podem disparar fluxos ativos no ClickMax. Os três fluxos gerenciados encontrados na consulta de 05/11/2026 estavam fechados. [Gatilhos de automação](https://docs.clickmax.io/reference/automation-triggers)

#### Quadro Bia Go

O quadro **Bia Go** foi criado no ClickMax com as colunas abaixo.

| Coluna no ClickMax | Etapa no SDR | Quando entra |
| --- | --- | --- |
| Novo lead | `contact_pending` | Lead recebido e aguardando o primeiro contato |
| Contatado | `contacted` | Primeiro contato registrado |
| Conectado | `engaged` | Resposta recebida |
| Buscando horário | `scheduling` | Bia consulta ou oferece horários |
| Reunião agendada | `booked` | Reserva confirmada no PostgreSQL e no Google Agenda |
| Presença confirmada | `presence_confirmed` | Lead confirma que pretende comparecer |
| Aguardando presença | `in_meeting`, `awaiting_attendance` | Horário da reunião chegou e a equipe ainda não registrou o desfecho |
| Compareceu | `attended` | Comparecimento registrado |
| No-show | `no_show` | Falta registrada |
| Cancelado | `cancelled` | Cancelamento confirmado |

O mapa de IDs retornados pelo ClickMax está no arquivo local `.local/clickmax/bia-go-map.json`. A sincronização depende de configurar esse mapa no serviço e vincular uma oportunidade a um lead. Entradas futuras precisam informar o ID do card criado pelo fluxo de origem ou ter uma etapa de criação própria. Telefones compartilhados por mais de um contato exigem identificação adicional antes do vínculo.

### Agenda ClickMax do SDR interno

O SDR reaproveita a agenda de diagnóstico do **Time Bilhon · Diagnóstico**. A Bia consulta as vagas da agenda, sugere até duas pelo WhatsApp e encaminha a escolha explícita ao worker de agendamento. O worker revalida a vaga e faz a reserva via API com o ID da agenda. O ClickMax escolhe o vendedor livre conforme as regras do time e sincroniza o Google Calendar que o vendedor já conectou. A confirmação e os lembretes dependem do registro da reserva. [API do ClickMax](https://docs.clickmax.io/openapi.yaml)

A consulta usa as rotas de leitura da página pública configurada em `BIA_SCHEDULING_URL`. Essas rotas ficam fora do contrato documentado da API do CRM. As ofertas compartilham uma consulta por até oito segundos no mesmo processo. O worker consulta o dia escolhido novamente antes de gravar. Se a consulta falhar ou não retornar opções, a Bia explica a situação pelo WhatsApp e registra a pendência. A API de reserva exige um contato identificável no CRM. Contatos ausentes ou ambíguos vão para revisão.

A remarcação altera a mesma reunião do ClickMax, com o vendedor já atribuído. Depois que o ClickMax confirma o novo horário, o SDR registra a troca e invalida os lembretes antigos antes de programar os novos. Se o horário escolhido for recusado, o worker mantém a reserva atual e consulta outras opções. Em caso de resposta incerta, o worker consulta a mesma reunião antes de confirmar a troca. A Bia confirma a remarcação pelo WhatsApp sem link. Cancelamentos explícitos também passam pelo worker e invalidam os lembretes pendentes.

Confirmações bloqueadas pelo limite de mensagens continuam na fila com o mesmo identificador. O worker estima quando as cotas horária e diária voltam a ter espaço, aguarda sem gastar tentativas e verifica a reserva e a cota novamente antes de enviar. Se a reunião for cancelada, remarcada ou já tiver começado, a confirmação antiga perde a validade.

Configure `BIA_CLICKMAX_PUBLIC_SCHEDULE_ID` com o ID da agenda e `BIA_CLICKMAX_PUBLIC_SINCE` com a data de ativação em RFC3339. O worker registra as reservas feitas pela Bia e também consulta o ClickMax a cada 20 segundos. Ele importa reservas feitas pela página a partir do corte e vinculadas ao quadro do SDR. O telefone da reserva deve corresponder a um único lead ativo da Bia, incluindo a variante brasileira do WhatsApp. Um vínculo verificado de contato e card permite identificar reservas sem telefone. E-mails conflitantes e oportunidades ambíguas ficam fora da importação. Se a resposta de uma criação feita pelo worker se perder, ele procura o resultado com a chave gravada nas notas antes de qualquer confirmação.

A reserva confirmada alimenta as sequências de lembretes já configuradas, respeitando janela de contato e consentimento para SMS. Remarcações e cancelamentos feitos no ClickMax atualizam o SDR e invalidam os avisos da reserva anterior. O endpoint de disponibilidade do formulário retorna `calendar_mode: clickmax_public` e `booking_url` para encaminhar à página da agenda.

#### Modo com agendas vinculadas por vendedor

A agenda é configurada por vendedor, separadamente do quadro do CRM. A Bia cruza os bloqueios das agendas Google selecionadas, as reservas do PostgreSQL e os compromissos do ClickMax. Entre os vendedores livres, considera quem tem menos reuniões futuras. O ClickMax valida o horário de novo na gravação. Sua API pública permite listar, criar, remarcar e cancelar reuniões, mas não expõe a grade de horários livres nem os ajustes de disponibilidade de cada vendedor. [Contrato da API](https://docs.clickmax.io/openapi.yaml)

1. No ClickMax, o vendedor conecta o Google em **Configurações do CRM → Conexões** e configura na agenda os horários e a duração das reuniões oferecidas pela Bia. [Conexão com o Google Agenda](https://docs.clickmax.io/features/contacts/connect-google-calendar)
2. No SDR, o mesmo vendedor conecta as agendas que devem bloquear horários em [Conectar agenda](https://sdk.arkom.ai/conectar-agenda/) e habilita o perfil de agendamento. A conta que recebe o compromisso pelo ClickMax deve estar entre as agendas verificadas pela Bia.
3. Com a chave do workspace no ambiente, use `bia -clickmax-list-attendants` para obter os IDs dos atendentes. Configure `BIA_CLICKMAX_CALENDAR_ATTENDANTS` com um objeto JSON no formato `{"ID_DO_USUARIO_NO_SDR":"UUID_DO_ATENDENTE_NO_CLICKMAX"}`. A opção exige o modo live e `BIA_GOOGLE_SCHEDULING_ENABLED=true`.
4. O lead precisa existir no ClickMax. A Bia usa o vínculo verificado do card, quando existe. Sem o vínculo, exige uma única correspondência por e-mail e verifica o telefone. Um contato ausente ou ambíguo encaminha a operação para revisão.

Com o mapeamento ativo, a Bia consulta primeiro o ClickMax e só oferece vagas de vendedores vinculados a ele. O Google complementa a consulta com bloqueios de horário. Se a agenda do ClickMax estiver indisponível ou não tiver vaga, a Bia informa que não conseguiu oferecer aquele horário. O ClickMax grava a reunião e cuida da sincronização com o Google. A Bia confirma após verificar a reserva no ClickMax e gravá-la no PostgreSQL. Conversa, painel, voz e lembretes usam essa reserva. Remarcações e cancelamentos de reservas existentes usam a integração que fez o agendamento original. Em caso de retorno incerto da API, a Bia consulta o resultado antes de confirmar. A tentativa fica registrada para revisão e o horário fica reservado internamente enquanto o resultado é desconhecido.

Essa integração acompanha as reuniões criadas, remarcadas ou canceladas pela Bia. Mudanças feitas diretamente no ClickMax ainda precisam ser conciliadas com o SDR para atualizar o horário dos lembretes.

## Falhas e reprocessamento

Inbox/outbox e estado ficam em transação no Postgres. Workers usam lease de dois minutos por lead, decisão/operação com prazo menor e token que impede um worker atrasado de gravar resultados. Não há transação de banco aberta esperando uma IA responder.

- Falha comprovadamente repetível: até cinco tentativas, com atraso crescente.
- Timeout de uma mutação sem idempotência comprovada: `uncertain`, com revisão humana.
- Processo caiu enquanto executava um efeito: `uncertain`; o lead é pausado para revisão.
- Falha definitiva: `dead`, com motivo e tarefa local quando aplicável.
- Opt-out, tomada humana, reserva substituída, mensagem mais recente ou prazo vencido: o efeito pendente é invalidado antes do envio.

Operações incertas não têm botão genérico de “tentar novamente”. Confira o provedor pelo identificador da operação antes de decidir qualquer reenvio. Nesta etapa, inspeção e reconciliação operacional são feitas por API/SQL local; não foi construído um console de operadores.

Limites iniciais: 15 envios por lead/24h, 60 globais/h, follow-up de oferta após duas horas e no máximo um por 24h, janela de contato proativo das 8h às 20h no fuso do lead. O primeiro contato solicitado pelo formulário é imediato. Lembretes previstos: 24h, 2h e 15min; lembretes vencidos não são acumulados para disparo tardio.

## Dados

O banco mantém perfil, histórico limitado a 30 turnos no estado e payloads dos jobs. Não há política automática de retenção nesta versão; defina-a antes de produção. Logs da aplicação não imprimem tokens, telefones ou corpos de provedores. A chave da OpenAI fica somente no ambiente. `.env` e `.local` são ignorados pelo Git e pelo build Docker.
