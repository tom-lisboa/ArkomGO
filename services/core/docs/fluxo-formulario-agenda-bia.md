# Bia Go — formulário, WhatsApp e agenda

Estado da operação interna da Arkom em 10/11/2026. As duas páginas de agendamento do diagnóstico usam a agenda **Diagnóstico de IA + 1 Sistema de IA Grátis** no workspace Arkom. A agenda tem reuniões de **45 minutos** e mantém os **12 vendedores**, os calendários conectados e os pesos do rodízio do ClickMax.

## 1. Jornada do cliente

```mermaid
flowchart TD
    A["Cliente preenche o formulário de diagnóstico"]
    A --> B["Lead entra no CRM do ClickMax"]
    A --> C["Cliente abre a agenda do formulário"]
    B --> D["Evento do pipeline SDR · ARKOM"]
    C --> E{"Cliente concluiu a reserva no site?"}
    E -->|Sim| F["ClickMax reserva e atribui o vendedor"]
    E -->|Ainda não| G["Pode continuar pelo WhatsApp após receber a abertura"]
    F --> H["Evento de reserva do ClickMax"]
    D --> I["Webhook da Bia Go"]
    H --> I
    I --> J{"Entrada válida e WhatsApp autorizado?"}
    J -->|Não| K["Registra o motivo e encerra a entrada"]
    J -->|Sim| L["Grava o evento uma vez no PostgreSQL"]
    L --> Z{"Evento aponta para reserva ainda não importada?"}
    Z -->|Sim| W["Worker aguarda a reserva verificada no ClickMax"]
    Z -->|Não| M{"Há uma reserva ativa vinculada?"}
    W -->|Importada| M
    W -->|Cancelada| X["Encerra a abertura ligada àquela reserva"]
    M -->|Sim| N["Confirma data e hora no WhatsApp"]
    M -->|Ainda não| O["Abertura com Ver horários e Tirar dúvida"]
    O --> G
    G -->|Toca em Ver horários| P["Bia consulta a agenda do ClickMax e oferece até dois horários"]
    P --> Q{"Cliente escolheu um horário?"}
    Q -->|Sim| R["Worker de agenda revalida e solicita a reserva"]
    Q -->|Ainda não| S["Conversa segue ou entra na régua sem resposta se elegível"]
    R --> T{"ClickMax confirmou?"}
    T -->|Sim| N
    T -->|Vaga ocupada| P
    T -->|Resultado incerto| U["Worker confere a operação no ClickMax"]
    U -->|Reserva confirmada| N
    U -->|Permanece incerto| Y["Encaminha para revisão"]
    N --> V["Worker de follow-up executa os lembretes elegíveis"]
```

Os eventos do pipeline que entram nessa integração são **Novo Lead**, **Reagendamento** e **Tentativas 1, 2 e 3**. O caminho pelo pipeline pode iniciar o contato enquanto a pessoa ainda está escolhendo uma vaga. Quando já existe uma reserva válida, a Bia usa essa informação para confirmar o horário. Se a abertura com data e hora já cobriu a confirmação, o backend suprime a mensagem redundante.

No teste da Ana, final **1844**, o card entrou primeiro. A Bia abriu a conversa pelo **+55 11 93624-6321**, com **Ver horários** e **Tirar dúvida**. A Twilio confirmou a entrega da abertura e do vídeo. Esse teste comprovou a entrada pelo CRM até o WhatsApp. A reserva pelo botão era o próximo passo.

## 2. Formulário, backend e ClickMax

```mermaid
flowchart LR
    subgraph SITE["Site do diagnóstico"]
        FORM["Formulário em diagnostico.bilhon.com"]
        PAGE["Páginas /agendar-reuniao e /agendar-clickmax"]
        FORM --> PAGE
    end
    subgraph CM["ClickMax · workspace Arkom"]
        CRM["CRM · pipeline SDR · ARKOM"]
        AV["Agenda de 45 min · 12 vendedores"]
        G["Calendários conectados e rodízio do time"]
        AV <--> G
    end
    subgraph GO["Backend Bia Go"]
        API["POST /webhooks/bia/leads"]
        DB[("PostgreSQL · leads, reservas e filas")]
        AG["Worker de agenda"]
        EX["Workers de contexto e execução"]
        FU["Worker de follow-up"]
        API --> DB
        DB <--> AG
        DB <--> EX
        DB --> FU
        EX -->|Consulta e pedidos de agenda| AG
    end
    FORM -->|Cadastro chega ao CRM| CRM
    PAGE -->|Consulta e reserva no site| AV
    CRM -->|IDs do card, contato e etapa| API
    AV -->|Evento com ID da reserva| API
    API -->|Confere contato, card e consentimento| CRM
    API -->|Confere a reserva informada| AV
    AG <-->|Consulta, cria, remarca e cancela| AV
    EX --> WA["Twilio · WhatsApp da Bia +55 11 93624-6321"]
    FU --> WA
    WA -->|Resposta ou botão do cliente| EX
```

O navegador usa a agenda pública do ClickMax. O evento que liga a reserva ao backend vem do ClickMax e chega autenticado a `POST https://sdk.arkom.ai/webhooks/bia/leads`. A API consulta o ClickMax para validar o evento e enfileira o trabalho no PostgreSQL. O `202` indica que a entrada foi recebida pelo backend. A entrega ao WhatsApp é registrada à parte pelo retorno da Twilio.

Desde 11/11, a faixa de vagas das duas páginas acompanha o seletor de fuso do calendário. A escolha altera a hora exibida e preserva o instante da reserva. O evento do ClickMax não inclui o fuso selecionado. Quando o Go não tem um fuso no cadastro, as confirmações do ClickMax usam o horário de Brasília com rótulo explícito.

| Responsável | O que gerencia |
| --- | --- |
| Formulário | Coleta o cadastro e abre a página de agendamento da rota do cliente. |
| ClickMax | Mantém a agenda comercial, disponibilidades, equipe, rodízio e reserva confirmada. Para novas reservas da Bia, recebe o horário e escolhe o vendedor elegível. |
| Worker de agenda | Consulta vagas, revalida o horário escolhido, chama o ClickMax e confere o resultado. Importa e reconcilia alterações nas reservas. |
| PostgreSQL | Guarda a conversa, a referência da reserva do ClickMax, o horário, o vendedor e os trabalhos pendentes. Identifica repetições pelo card, reserva ou operação. |
| Workers de contexto e execução | Recebem mensagens e botões, consultam a reserva, apresentam horários e enfileiram pedidos ao worker de agenda. |
| Workers de follow-up, mídia e voz | Enviam lembretes e executam áudio ou ligação nas condições de cada canal. |
| Twilio | Entrega o WhatsApp pelo número da Bia e devolve o estado de entrega. |

O Google entra pela agenda conectada dos vendedores no ClickMax. Nesse caminho, a Bia usa a agenda do time e o rodízio configurado no ClickMax para as novas reservas. A distribuição por menor número de reuniões futuras precisaria ser uma regra do rodízio da agenda ou uma mudança específica na integração.

## 3. O que acontece quando a Bia mexe na agenda

```mermaid
flowchart TD
    A["Cliente pede horário, remarcação ou cancelamento"]
    A --> B{"Ação pedida"}
    B -->|Agendar ou remarcar| C["Consulta vagas reais e oferece até duas opções no WhatsApp"]
    B -->|Cancelar| D["Localiza e confere a reserva ativa no ClickMax"]
    C --> E["Cliente escolhe e o worker revalida a vaga"]
    E --> F{"Vaga continua livre?"}
    F -->|Não| C
    F -->|Sim| G["Grava a operação no PostgreSQL"]
    G --> H{"Já havia reserva para remarcar?"}
    H -->|Não| I["Cria no ClickMax e recebe o vendedor do rodízio"]
    H -->|Sim| J["Atualiza a mesma reserva no ClickMax"]
    D --> K["Pede cancelamento e verifica o estado cancelado"]
    I --> L{"Resultado verificável?"}
    J --> L
    K -->|Cancelamento verificado| M
    K -->|Resultado incerto| O
    L -->|Sim| M["Atualiza reserva e filas no PostgreSQL"]
    L -->|Incerto| N["Consulta o ClickMax antes de repetir qualquer operação"]
    N -->|Resultado encontrado| M
    N -->|Permanece incerto| O["Operação vai para revisão"]
    M --> P{"Reserva continua ativa?"}
    P -->|Sim| Q["Envia confirmação ou remarcação e recalcula lembretes"]
    P -->|Não| R["Encerra lembretes da reserva cancelada"]
```

- **Agendamento.** A Bia oferece até duas vagas reais no WhatsApp. A escolha é revalidada antes da criação. A confirmação usa a reserva retornada pelo ClickMax.
- **Remarcação.** O worker atualiza a mesma reserva no ClickMax. O horário anterior segue reservado até o ClickMax aceitar o novo. Depois o Go encerra os lembretes pendentes do horário anterior e calcula os do novo.
- **Cancelamento.** O worker confirma o cancelamento no ClickMax antes de baixar a reserva no Go. Uma abertura aguardando aquela reserva também sai da fila.
- **Alteração feita no ClickMax.** A sincronização do worker consulta a agenda periodicamente e importa alterações verificadas. Se a operação ficar incerta após um timeout, o worker procura a reserva pelo identificador ou pelo registro da operação.

## 4. Réguas que dependem da agenda

| Momento | Ação programada |
| --- | --- |
| Cadastro sem reserva | Abertura com botões e vídeo de apresentação quando elegível. |
| Sem resposta e sem reserva | Follow-ups em +15 min, +2 h, +6 h, +24 h, +48 h e +72 h, sujeitos à janela de contato. |
| Reserva confirmada | Confirmação com data e hora. Fora da janela de atendimento, a confirmação usa o modelo de utilidade aprovado. |
| 15 min após a abertura | Preparação quando existe reunião ativa e ainda há tempo antes da régua final. |
| 24 h, 2 h e 1 h antes | Lembretes de WhatsApp quando ainda cabem na régua. |
| 30 min antes | Áudio quando há janela de atendimento aberta e o arquivo está disponível. |
| 15 min antes | Mensagem e fluxo de autorização. A ligação depende de permissão válida no WhatsApp. |
| 5 min antes | Lembrete no WhatsApp. SMS depende de consentimento separado. |
| Na hora | Aviso de início quando aplicável. O check-in automático de 7 min após o início foi desativado em 11/11. |

Cada envio passa pelas regras vigentes de consentimento, horário, atendimento humano, estado da reserva e janela do canal. A fila mostra o que foi programado e a Twilio informa o que foi efetivamente entregue.

Antes de um follow-up comercial, a Bia consulta os cards atuais do contato no ClickMax. Negociação, fechamento, reunião realizada e ganho bloqueiam o disparo automático dessas réguas.
