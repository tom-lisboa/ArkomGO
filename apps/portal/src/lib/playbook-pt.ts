/* ============================================================
   playbook-pt.ts (Fidv3 M7b) — PT-BR overlay for the per-job 'big text'
   (replaces / notes / bespoke ladder / human). Keyed by the exact EN job name;
   EN source lives in components/map/playbook-data.ts (verbatim). Consumed via
   pbText() in content-pt. Translated in 6 parallel batches; do not hand-edit
   wholesale — prefer regeneration. 137 original jobs + 6 Bilhon solutions.
   ============================================================ */

export interface PlaybookPt {
  replaces?: string;
  human?: string;
  notes?: string;
  ladderManual?: string;
  ladderAssisted?: string;
  ladderAutonomous?: string;
}

export const PLAYBOOK_PT: Record<string, PlaybookPt> = {
  "ICP Definition": {
    "replaces": "O feeling do founder, aplicado de forma inconsistente por todo mundo lá na ponta. Um ICP mal feito desperdiça cada dólar gasto depois dele.",
    "notes": "Comece por aqui. Este é o primeiro nó da árvore de Vendas por um motivo · todo job lá na frente (sourcing, scoring, escrita) lê a partir dele. Escreva uma página por vertical: firmográficos, a dor nas palavras do comprador, o gatilho que faz ele comprar agora. Guarde num lugar que seus agentes consigam ler, não num deck.",
    "ladderManual": "Um slide de 2 anos atrás que ninguém abre.",
    "ladderAssisted": "A IA rascunha perfis de ICP por vertical a partir dos seus dados de closed-won; um humano edita trimestralmente.",
    "ladderAutonomous": "Os perfis se atualizam sozinhos conforme os deals fecham e são perdidos · padrões de vitória retroalimentam sem precisar de reunião.",
    "human": "O founder é dono disso pra sempre. A IA rascunha e atualiza; o humano decide pra quem o negócio existe. Nunca 100% delegado."
  },
  "Database Mining": {
    "replaces": "4–6 horas/semana de um SDR puxando e limpando listas · algo como $8–12k/ano do tempo de um rep de $65k gasto sem vender.",
    "notes": "A skill dedicada constrói listas de leads em camadas a partir de bancos de dados estruturados e da web aberta, e degrada de forma graciosa conforme as API keys que você tem. Alimente ela com seu arquivo de ICP · a qualidade do output é função direta do nó um.",
    "ladderManual": "Alguém exporta CSVs de uma ferramenta de banco de dados e conserta tudo em planilhas.",
    "ladderAssisted": "Você descreve o alvo em linguagem natural; o agente monta a query, puxa, deduplica e devolve uma lista limpa e segmentada.",
    "ladderAutonomous": "Buscas permanentes rodam semanalmente por ICP; novos matches chegam pré-pontuados, com contatos verificados, sem ninguém pedir.",
    "human": "Um humano define o alvo e confere por amostragem 10 linhas por puxada. Listas ruins envenenam tudo lá na frente · a conferência leva cinco minutos e salva uma campanha."
  },
  "Social Mining": {
    "replaces": "A lista que ninguém monta na mão: todo mundo que engajou com o post de um concorrente é um prospect morno, mas raspar isso manualmente leva horas por post.",
    "notes": "A lista fria de maior intenção que você consegue montar · essas pessoas já levantaram a mão sobre o tema. A skill dedicada raspa quem engajou, enriquece perfis, pontua contra o ICP e escreve as aberturas numa passada só.",
    "ladderManual": "Você tira print dos comentaristas e pesquisa um por um.",
    "ladderAssisted": "Aponte o agente pra um post ou perfil; ele coleta quem engajou, enriquece, pontua contra o ICP e rascunha o primeiro DM.",
    "ladderAutonomous": "Contas e palavras-chave monitoradas alimentam um pool permanente de prospects mornos, atualizado continuamente."
  },
  "Personalization Research": {
    "replaces": "10–15 minutos por prospect feito direito · que é justamente por que ninguém faz direito depois dos primeiros vinte.",
    "notes": "É a diferença entre personalização e mail-merge. A skill dedicada produz um dossiê estruturado por pessoa: o que ela falou publicamente, o que mudou na empresa dela e os dois hooks mais fortes pra abrir.",
    "ladderManual": "Dois minutos no LinkedIn e depois “Adoro o que vocês estão fazendo na {company}!”",
    "ladderAssisted": "O agente monta um dossiê por prospect · hooks, movimentos recentes, pontos em comum · e um humano escolhe o ângulo.",
    "ladderAutonomous": "Todo lead que entra numa sequência carrega o dossiê junto; os agentes de escrita consomem ele direto."
  },
  "Cold Email Drafting": {
    "replaces": "O output central de um SDR de $60–80k/ano · ou um retainer de agência de $2–4k/mês que manda o mesmo template pra todo mundo.",
    "notes": "A voz é o jogo todo. A skill dedicada lê seus arquivos de oferta e de tom antes de escrever uma palavra · configure isso primeiro ou você vai receber um genérico competente. Sequências de três passos, problema → prova → fechamento de porta. Nunca comece pelo preço.",
    "ladderManual": "Um template, token de primeiro nome, reza.",
    "ladderAssisted": "O agente escreve a sequência completa por segmento a partir do seu doc de oferta e dos dossiês; um humano aprova antes de disparar.",
    "ladderAutonomous": "As sequências se geram por campanha, com variantes A/B incluídas, e os dados de resposta alimentam os ângulos da próxima rodada.",
    "human": "Um humano aprova toda sequência nova antes de disparar e é dono da oferta que ela vende. Uma vez que a sequência está provada, a IA varia ela dentro do frame aprovado."
  },
  "LinkedIn Messaging": {
    "replaces": "Os 30 pedidos de conexão/dia que um founder manda numa semana boa e zero numa semana corrida. Consistência é o canal inteiro.",
    "notes": "Mais curto que email, mais humano, sem links na primeira mensagem. A skill dedicada rascunha o arco completo de conexão → DM → Follow-Up e exporta pras plataformas de envio.",
    "ladderManual": "Notas de “adoraria me conectar” copiadas e coladas.",
    "ladderAssisted": "Notas de conexão e sequências de DM rascunhadas por prospect a partir do dossiê dele; o humano envia.",
    "ladderAutonomous": "Envio sequenciado através de uma plataforma de outreach, com as respostas roteadas de volta pro pipeline automaticamente.",
    "human": "As mensagens saem no nome de uma pessoa real · essa pessoa lê o que sai embaixo do nome dela. Aprovação por sequência, não por mensagem."
  },
  "Account Enrichment": {
    "replaces": "O passo de pesquisa que todo mundo pula: fazer outreach pra uma empresa que você não entende parece spam porque é spam.",
    "notes": "Faz par com o Company Deep-Dive no departamento de Intelligence · o enriquecimento é a passada em massa, o deep-dive é a cirúrgica pras contas que valem uma busca de verdade.",
    "ladderManual": "Uma olhada no site antes da call.",
    "ladderAssisted": "Tech stack, tendências de headcount e sinais de crescimento anexados a toda conta-alvo sob demanda.",
    "ladderAutonomous": "As contas se re-enriquecem num agendamento; mudanças materiais (funding, picos de contratação, mudanças de stack) disparam alertas pra camada de targeting."
  },
  "Reply Classification": {
    "replaces": "O loop de ansiedade de ficar checando a inbox. No volume, um humano perde respostas quentes por 6+ horas · e velocidade de resposta é a variável de maior alavancagem no outbound.",
    "notes": "O padrão que escala o outbound pra além de uma inbox só. Construa a biblioteca de objeções a partir das suas respostas reais · depois de ~50 threads classificadas as categorias estabilizam e os rascunhos param de precisar de edição. Este é o nó que redes de franquia e negócios multi-território sentem mais forte.",
    "ladderManual": "O founder lê cada resposta, geralmente à meia-noite.",
    "ladderAssisted": "Toda resposta auto-etiquetada · interessado / objeção / indicação / agora-não / nunca · com respostas rascunhadas na fila pra aprovação.",
    "ladderAutonomous": "Respostas interessadas roteiam pra agenda em minutos; objeções recebem respostas da biblioteca; só os edge cases chegam num humano.",
    "human": "Edge cases roteiam pra um humano em minutos; todo o resto fica logado pra uma auditoria semanal de 15 minutos das decisões do classificador."
  },
  "Meeting Booking": {
    "replaces": "O vai-e-volta de 4–7 mensagens que mata o momentum do deal, mais os no-shows que ninguém corre atrás.",
    "notes": "Ligue à sua disponibilidade real com buffers, não à aspiracional. Só a sequência de recuperação de no-show já paga o build · a maioria dos times simplesmente deixa esses morrerem.",
    "ladderManual": "“Que horários funcionam pra você?” × 3.",
    "ladderAssisted": "O agente propõe slots a partir da agenda ao vivo e marca na confirmação.",
    "ladderAutonomous": "Respostas quentes recebem slots já na primeira resposta; no-shows recebem uma sequência de recuperação automaticamente.",
    "human": "O dono da agenda define as regras uma vez · buffers, horários, quem qualifica. O agente nunca negocia exceções; humanos negociam."
  },
  "Pre-Call Briefing": {
    "replaces": "Os 20 minutos atropelados antes de cada call · ou pior, entrar frio e perguntar coisas que o site responde.",
    "notes": "Lê o CRM, as transcrições passadas e as threads de email. O efeito de composição é real: na terceira call o briefing sabe mais sobre a relação do que você lembra.",
    "ladderManual": "Passar o olho no LinkedIn deles na sala de espera.",
    "ladderAssisted": "Um briefing de uma página chega antes de cada call: quem, empresa, histórico, última conversa, threads abertas, objetivos sugeridos.",
    "ladderAutonomous": "Os briefings se geram a partir da agenda automaticamente · toda reunião externa, sem precisar de trigger."
  },
  "Call Capture": {
    "replaces": "Notas que não existem, decisões que ninguém anotou e “peraí, o que a gente combinou mesmo?”",
    "notes": "O nó de maior alavancagem mais barato deste mapa · uma assinatura de notetaker e uma convenção de arquivamento. Tudo nas árvores de Deals e Operations fica mais inteligente no dia em que isso liga. Se você for implantar um nó este mês, implante este.",
    "ladderManual": "Caneta, papel, vibe.",
    "ladderAssisted": "Toda reunião gravada e transcrita via notetaker; transcrições arquivadas por cliente.",
    "ladderAutonomous": "As transcrições fluem pra base de conhecimento automaticamente e viram contexto legível pra todos os outros agentes.",
    "human": "Humanos conduzem a reunião; o sistema só nunca esquece dela. Marque calls sensíveis como não-gravar · a convenção importa mais que a ferramenta."
  },
  "Post-Call Debrief": {
    "replaces": "30 minutos de admin pós-call por reunião que ou come tempo de venda ou simplesmente não acontece.",
    "notes": "Combine com o Follow-Up Drafting: o email de recap deve chegar enquanto o prospect ainda lembra da call. O Follow-Up no mesmo dia performa mensuravelmente melhor que no dia seguinte · e a IA torna o mesma-hora trivial.",
    "ladderManual": "Os action items moram na sua cabeça até que não moram mais.",
    "ladderAssisted": "Transcrição → resultados, action items, atualizações de deal-stage, rascunhados em minutos depois de desligar.",
    "ladderAutonomous": "O CRM se atualiza sozinho, as tarefas se atribuem sozinhas e o email de Follow-Up está esperando nos rascunhos.",
    "human": "O dono do deal passa o olho nas ações extraídas no mesmo dia · 2 minutos pra confirmar o que um humano prometeu a outro humano."
  },
  "Demo Prototyping": {
    "replaces": "O buraco de duas semanas da proposta onde os deals esfriam. Um protótipo visual enviado no mesmo dia colapsa por completo a conversa de “isso é possível?”.",
    "notes": "Venda o sonho: mostre a eles o estado final antes da proposta existir. A call de Follow-Up deixa de ser “me convence” e vira “escopa isso”. A skill dedicada extrai o briefing de uma transcrição, escolhe o formato certo e rascunha a mensagem de envio.",
    "ladderManual": "Um deck de Follow-Up, uma hora dessas.",
    "ladderAssisted": "Notas de discovery → protótipo visual funcional + mensagem de envio, no mesmo dia, o humano revisa antes de sair.",
    "ladderAutonomous": "Toda call de discovery dispara um rascunho de protótipo; o humano escolhe quais lapidar e enviar.",
    "human": "A IA constrói o protótipo; o humano decide se ele vai pro ar. Nada chega num prospect sem os olhos do vendedor em cima."
  },
  "Proposal Generation": {
    "replaces": "3–6 horas por proposta · e pra empresas de serviços que participam de licitações, muitas vezes 2–3 dias por resposta. Isso frequentemente é o gargalo da própria receita.",
    "notes": "O template matching é a chave: suas melhores propostas passadas viram a biblioteca de padrões. Construa o template da marca uma vez, renderize programaticamente pra sempre. Escritórios de arquitetura e firmas de serviços profissionais mantêm times inteiros de bid no que este nó substitui.",
    "ladderManual": "Última proposta, find-and-replace, logo novo.",
    "ladderAssisted": "Contexto da call → proposta rascunhada no template da casa, renderizada em PDF com a marca; o humano edita escopo e preço.",
    "ladderAutonomous": "Os rascunhos de proposta se geram a partir do registro do deal no momento em que um deal chega no estágio “proposta”, casados com a vitória passada mais próxima.",
    "human": "A IA rascunha estrutura e texto; um humano é dono do escopo e do preço em toda proposta. Esses dois números nunca são delegados."
  },
  "Deal Room Assembly": {
    "replaces": "Propostas em PDF que são encaminhadas pro vácuo. Uma room rastreada te diz quem abriu o quê, quando · uma intel que um PDF nunca vai te dar.",
    "notes": "A capacidade de encaminhar é o ponto · seu champion vende internamente com um link, não com um anexo. Magic links por stakeholder transformam dados de abertura num mapa de stakeholders.",
    "ladderManual": "Anexo numa thread de email.",
    "ladderAssisted": "Room com a marca, protegida por senha, por prospect · proposta, escopo, prova, pricing · montada a partir de um template.",
    "ladderAutonomous": "As rooms se geram por deal com rastreamento de engajamento alimentando o pipeline: você sabe qual stakeholder leu o pricing duas vezes."
  },
  "Reactivation": {
    "replaces": "A receita parada na sua coluna de deals mortos. A maioria dos pipelines tem 6 dígitos de “ficou no silêncio” que ninguém revisita de forma sistemática.",
    "notes": "O re-opener precisa conter valor novo · um build relevante, um resultado na vertical deles, uma oferta que mudou. “Só passando pra ver” não é reativação, é ruído. O pipeline mais barato que você vai gerar na vida; os leads já estão pagos.",
    "ladderManual": "Você lembra de um prospect antigo no banho.",
    "ladderAssisted": "Deals dormentes emergem num agendamento com um re-opener rascunhado e ciente do contexto · referenciando onde as coisas pararam, começando com algo novo.",
    "ladderAutonomous": "Todo deal que entra no silêncio entra automaticamente numa trilha de revival paciente e espaçada; as respostas roteiam de volta pro pipeline.",
    "human": "Um humano aprova a lista de revival mensalmente · alguns deals mortos devem continuar mortos, e só um humano sabe quais."
  },
  "Performance Mining": {
    "replaces": "Postar no instinto enquanto o seu próprio corpus já sabe o que funciona. Seus top 10 posts são uma estratégia de conteúdo · se alguém os ler.",
    "notes": "Re-hashear ganha de inventar: uma ideia provada num formato novo performa melhor que uma ideia nova em qualquer formato, e as audiências esquecem mais rápido do que os creators pensam.",
    "ladderManual": "Rolar o seu próprio perfil atrás de ideias.",
    "ladderAssisted": "O corpus ranqueado por performance, padrões extraídos · hooks, formatos, tópicos · com candidatos a re-hash marcados.",
    "ladderAutonomous": "Todo post novo é pontuado contra a biblioteca de padrões antes de sair; os vencedores alimentam automaticamente a fila de ideias."
  },
  "Trend Monitoring": {
    "replaces": "Uma hora por dia rolando o feed disfarçado de pesquisa.",
    "notes": "A skill dedicada roda tema → artigos → hooks → ideias prontas pra rascunhar como uma cadeia só. Velocidade importa mais que acabamento em conteúdo de trend · a meia-vida é medida em dias.",
    "ladderManual": "O que quer que o algoritmo tenha te mostrado no café da manhã.",
    "ladderAssisted": "Varredura diária do nicho · temas explodindo, formatos em ascensão · destilados em ângulos de conteúdo na sua voz.",
    "ladderAutonomous": "Os ângulos do dia chegam toda manhã, pré-casados com os seus pilares e ranqueados por aderência."
  },
  "Competitor Analysis": {
    "replaces": "Observar concorrentes de forma casual em vez de sistemática. Os posts virais deles são P&D grátis · outra pessoa pagou o custo do teste.",
    "notes": "A transcrição é o truque · o hook falado é onde o padrão mora, não a legenda. Duas skills dedicadas: uma pra reels do Instagram, uma pro TikTok.",
    "ladderManual": "Você viu o reel deles e sentiu alguma coisa.",
    "ladderAssisted": "Conteúdo do concorrente raspado e transcrito; padrões de hook, formatos e cadência extraídos num playbook.",
    "ladderAutonomous": "Contas monitoradas alimentam uma biblioteca de padrões permanente; o seu gerador de hooks consome ela direto."
  },
  "Hook Writing": {
    "replaces": "O imposto da página em branco em cada peça de conteúdo. O hook é 80% da performance e a parte em que a maioria dos creators gasta o menor tempo.",
    "notes": "Volume é o método: escreva vinte, publique um. A skill dedicada gera por plataforma · um hook de LinkedIn e um hook de TikTok são espécies diferentes.",
    "ladderManual": "Primeira linha que vem à cabeça, postada.",
    "ladderAssisted": "15–20 hooks ranqueados por ideia, por plataforma, gerados a partir de padrões provados · você escolhe, você posta.",
    "ladderAutonomous": "Toda ideia na fila chega com suas variantes de hook anexadas; os dados de performance re-ranqueiam os padrões mensalmente."
  },
  "Cross-Platform Adaptation": {
    "replaces": "O multiplicador de conteúdo de 5× que todo mundo comenta e quase ninguém operacionaliza, porque repurposing manual é genuinamente tedioso.",
    "notes": "Nativo ganha de sindicado · cada plataforma ganha a própria estrutura, não um resize. A skill dedicada passa uma ideia pela pesquisa e a entrega em sete formatos.",
    "ladderManual": "A mesma legenda colada em quatro apps.",
    "ladderAssisted": "Uma ideia → formatos nativos pra cada plataforma: post de LinkedIn, thread no X, seção de newsletter, roteiro de vídeo, roteiros de short-form.",
    "ladderAutonomous": "Toda peça flagship se espalha automaticamente pro conjunto completo de formatos, na fila pra revisão."
  },
  "Image Generation": {
    "replaces": "Fotos de stock que parecem fotos de stock, ou $50–200/imagem de um designer pra visuais de marca rotineiros.",
    "notes": "A biblioteca de referência é o fosso: alimente ela com seus melhores visuais existentes e fotos de identidade pra que o output continue inconfundivelmente seu. Duas skills dedicadas · imagem de marca e imagem pessoal com personagem consistente.",
    "ladderManual": "Canva às 23h.",
    "ladderAssisted": "Imagens consistentes com a marca geradas a partir de uma biblioteca de referência · a sua linguagem visual, aprendida e reproduzida.",
    "ladderAutonomous": "Todo post na fila recebe opções visuais dentro da marca geradas junto com a copy."
  },
  "Lead-Magnet Builds": {
    "replaces": "A tarefa de “a gente devia fazer um guia” que fica no roadmap por dois trimestres.",
    "notes": "Construa lead magnets só a partir de demanda provada · o reel que estourou te diz exatamente o que as pessoas querem atrás de um cadastro. Ligue a entrega ao Comment-CTA Fulfillment na árvore de Deals e o loop se fecha sozinho.",
    "ladderManual": "Um PDF feito uma vez, promovido duas, esquecido.",
    "ladderAssisted": "Temas de conteúdo que já performaram viram guias gated com landing pages, construídos end-to-end numa sessão.",
    "ladderAutonomous": "Tópicos de maior performance disparam rascunhos de lead magnets automaticamente; a camada de comment-CTA os entrega."
  },
  "Document Extraction": {
    "replaces": "Times inteiros lendo documentos e redigitando em sistemas. Em escala, isso é folha de pagamento inteira · o nó de maior densidade de ROI deste mapa para negócios pesados em documentos.",
    "notes": "Faça o benchmark antes de comemorar: monte um conjunto gold-standard de 50 documentos e meça a acurácia campo a campo contra ele. O padrão de fila de revisão (aceita automático acima do limiar, humano abaixo) te deixa production-safe muito antes de o modelo ficar perfeito. Serviços de liberdade condicional, seguros, compliance · verticais inteiras rodam sobre esse nó.",
    "ladderManual": "Humanos leem, humanos digitam, humanos erram.",
    "ladderAssisted": "Documentos → campos estruturados via um pipeline de extração, com scores de confiança e revisão humana na cauda de baixa confiança.",
    "ladderAutonomous": "Extrações de alta confiança fluem direto para o sistema de registro; acurácia comparada continuamente contra um gold set.",
    "human": "Humanos revisam a fila de baixa confiança e são donos do conjunto gold-standard. A máquina conquista autonomia campo a campo, medida contra ele."
  },
  "Meeting Follow-Ups": {
    "replaces": "Itens de ação combinados numa call com o cliente que evaporam até quinta-feira · o assassino silencioso da confiança na entrega.",
    "notes": "Clientes não dão churn por causa de resultados, dão churn por se sentirem esquecidos. Recaps no mesmo dia com donos nomeados são o sistema de retenção mais barato já construído.",
    "ladderManual": "Quem lembrou, faz. Talvez.",
    "ladderAssisted": "Transcrições do cliente → itens de ação extraídos, donos, prazos · rascunhados no recap que sai no mesmo dia.",
    "ladderAutonomous": "Os itens se atribuem sozinhos no sistema de tarefas e cobram seus donos; o recap do cliente é enviado no horário programado.",
    "human": "O líder de entrega confirma donos e prazos antes de o recap ir para o cliente · compromissos são feitos por pessoas."
  },
  "Context Maintenance": {
    "replaces": "O imposto do “peraí, qual a última desse cliente?” toda vez que alguém encosta numa conta.",
    "notes": "Isto É a doutrina de knowledge base na prática · um arquivo vivo por cliente que tudo lê e escreve. Comece pela convenção antes de automatizá-la: o formato do arquivo importa mais do que o tooling.",
    "ladderManual": "O contexto vive na cabeça de uma pessoa e em mil threads do Slack.",
    "ladderAssisted": "Arquivos de contexto por cliente atualizados conforme o trabalho acontece · calls, decisões, itens abertos, estado atual.",
    "ladderAutonomous": "Toda transcrição, e-mail e entregável atualiza o arquivo automaticamente; qualquer agente ou humano lê uma página e está por dentro."
  },
  "Company Deep-Dive": {
    "replaces": "Um dia de analista júnior (equivalente a $300–500) por empresa pesquisada direito · então só acontece para deals já em andamento, quando deveria acontecer antes.",
    "notes": "A skill dedicada pontua fit, não apenas fatos · o output é “devemos ir atrás, e com qual ângulo”, não um despejo de dados.",
    "ladderManual": "O site deles, o LinkedIn deles, a sua impressão.",
    "ladderAssisted": "Financeiros, sinais de crescimento, estrutura organizacional e postura estratégica compilados num perfil pontuado sob demanda.",
    "ladderAutonomous": "Contas-alvo se re-perfilam por triggers · captação, mudanças de liderança, picos de contratação · e alertam o pipeline."
  },
  "Person Research": {
    "replaces": "Entrar em salas sem saber com quem você está falando.",
    "notes": "Mesmo motor da Personalization Research em Vendas · aplicado aqui para relacionamentos em vez de sequências: parceiros, contratações, investidores, convidados de podcast.",
    "ladderManual": "Uma passada de olho no LinkedIn.",
    "ladderAssisted": "Histórico, trilha de conteúdo, interesses e pontos em comum compilados por pessoa, com hooks de personalização ranqueados.",
    "ladderAutonomous": "Todo novo contato no CRM ganha um perfil automaticamente; os briefings os consomem."
  },
  "Competitor Teardown": {
    "replaces": "Competir no achismo. A maioria das empresas não consegue articular o preço ou o posicionamento de um concorrente além de adjetivos.",
    "notes": "A seção de brechas exploráveis é o entregável · todo o resto é contexto. A skill dedicada estrutura o ataque: onde eles são fracos, onde você é forte, o que dizer no mercado.",
    "ladderManual": "Você visitou a página de preços deles uma vez.",
    "ladderAssisted": "Teardown completo sob demanda: preço, posicionamento, forças, fraquezas, brechas exploráveis · com fontes citadas.",
    "ladderAutonomous": "Concorrentes monitorados passam por novo teardown trimestralmente; mudanças materiais (preço, empacotamento, posicionamento) disparam alertas."
  },
  "Research Reports": {
    "replaces": "Contratos de pesquisa boutique de $2–5k, ou a decisão tomada sem nenhum.",
    "notes": "Combine com Adversarial Verification antes de qualquer coisa que sustente peso: afirmações são atacadas antes de serem acreditadas.",
    "ladderManual": "Vinte abas abertas e um palpite.",
    "ladderAssisted": "Qualquer pergunta → relatório estruturado, com fontes citadas e diagramas, em uma hora em vez de uma semana.",
    "ladderAutonomous": "Perguntas permanentes (mudanças de mercado, sinais de vertical) se atualizam no horário programado e publicam na knowledge base."
  },
  "FAQ & Self-Serve": {
    "replaces": "Os 40–60% do volume de suporte que são as mesmas quinze perguntas, respondidas na mão, para sempre.",
    "notes": "O flywheel é o ponto: tickets de suporte são o roadmap do seu conteúdo de ajuda, ranqueado por frequência. A deflexão compõe · cada artigo trabalha todo dia depois de publicado.",
    "ladderManual": "Copy-paste de um doc que ninguém atualiza.",
    "ladderAssisted": "Perguntas repetidas respondidas a partir de uma knowledge base viva; novas repetições sinalizadas e rascunhadas em conteúdo de ajuda.",
    "ladderAutonomous": "O corpus de ajuda cresce sozinho · todo ticket inédito resolvido vira um rascunho de artigo; taxa de deflexão monitorada.",
    "human": "Um humano revisa os novos artigos auto-rascunhados antes de publicarem, e é dono da linha de escalonamento no momento em que uma resposta não está no corpus."
  },
  "Health Scoring": {
    "replaces": "Descobrir que uma conta estava em risco no e-mail de cancelamento.",
    "notes": "O sentimento das transcrições de call e das threads de suporte é o indicador antecedente que os dados de uso não pegam · contas ficam quietas antes de irem embora.",
    "ladderManual": "Pânico de renovação, trimestral.",
    "ladderAssisted": "Contas pontuadas por uso, sentimento e engajamento; a lista de risco aparece mensalmente com os motivos.",
    "ladderAutonomous": "Os scores atualizam continuamente; cruzamentos de limiar disparam jogadas · abordagem, check-in, escalonamento · antes da temporada de renovação.",
    "human": "O score revela o risco; um humano toma a decisão. Nenhuma mensagem automática jamais vai para uma conta em risco sem um dono decidir enviá-la."
  },
  "Invoice Generation": {
    "replaces": "O founder fazendo invoices na noite de domingo, ocasionalmente errados, entre entidades e moedas.",
    "notes": "Codifique o roteamento de entidades uma vez · qual empresa fatura qual cliente, em qual moeda, com qual linha de imposto · e uma classe recorrente de erro desaparece permanentemente.",
    "ladderManual": "Um template, editado na mão, eventualmente enviado.",
    "ladderAssisted": "Invoices com marca gerados por entidade, moeda e tratamento tributário a partir do registro do deal.",
    "ladderAutonomous": "Marcos e cronogramas de retainer disparam invoices automaticamente; numeração, imposto e arquivamento resolvidos.",
    "human": "Um humano dá uma olhada em todo invoice acima de um limiar antes de enviar. Dinheiro saindo errado custa mais do que a olhada."
  },
  "Collections": {
    "replaces": "O constrangimento de cobrar dinheiro · que é por que founders cobram tarde e perdem semanas de fluxo de caixa para a própria educação.",
    "notes": "Um agente nunca tem vergonha de pedir. Espelhe o tom da relação · a sequência deve soar como a sua melhor versão num dia confiante, toda vez.",
    "ladderManual": "Você percebe um invoice não pago num momento de baixa.",
    "ladderAssisted": "Invoices vencidos ganham cutucadas rascunhadas · educadas, persistentes, escalando no cronograma · na fila para a sua aprovação.",
    "ladderAutonomous": "A sequência roda sozinha: cutucada no dia 3, mais firme no dia 10, escalonamento no dia 21, com o status de pagamento checado antes de cada envio.",
    "human": "Escalonamento de tom além da segunda cutucada exige uma decisão humana · a relação vale mais do que o invoice."
  },
  "Goal Pacing": {
    "replaces": "Descobrir em novembro que o número do ano nunca ia acontecer.",
    "notes": "A previsão importa mais do que o placar · “você fecha em 71% no ritmo atual” em junho é acionável; o mesmo número em dezembro é um obituário.",
    "ladderManual": "Um número na sua cabeça e uma sensação sobre ele.",
    "ladderAssisted": "Ritmo ao vivo contra a meta · mensal e anual · com uma previsão de onde a trajetória atual aterrissa.",
    "ladderAutonomous": "Alertas de ritmo com diagnóstico: qual gap de pipeline, qual mudança de retainer, qual sazonalidade está movendo o ponto de aterrissagem."
  },
  "Market Mapping": {
    "replaces": "Chutar o tamanho do lago. Times fazem campanha em verticais sem saber se o universo endereçável é 400 empresas ou 40.000 · e precificam o esforço errado de qualquer jeito.",
    "notes": "Isto é TAM no nível do nome da empresa, não no nível do relatório de analista · uma lista na qual você realmente consegue fazer campanha. Conheça o denominador antes de gastar: uma vertical de 4.000 empresas justifica um sistema, uma vertical de 150 empresas justifica uma carta escrita à mão para cada uma. A armadilha é mapear por código de indústria · SIC e NAICS mentem o tempo todo. Mapeie pelo que as empresas de fato fazem, extraído via scraping do que elas dizem sobre si mesmas.",
    "ladderManual": "Uma planilha de empresas de que alguém já tinha ouvido falar.",
    "ladderAssisted": "O agente constrói o universo completo por ICP · toda empresa que se encaixa, contada e segmentada · e um humano faz o sanity-check das bordas.",
    "ladderAutonomous": "O mapa se atualiza conforme empresas são fundadas, capitalizadas e fechadas; o planejamento de campanha lê números ao vivo, não o chute do ano passado."
  },
  "Trigger Detection": {
    "replaces": "Abordagem cronometrada pelo seu calendário em vez do deles. A diferença entre uma taxa de resposta de 2% e de 10% muitas vezes é só pegar uma empresa na semana em que algo mudou.",
    "notes": "Um sinal detectado que ninguém referencia é um sinal desperdiçado · o trigger tem que chegar na primeira linha do e-mail, não ficar parado num campo do CRM. Comece com os dois ou três triggers que genuinamente batem com a sua oferta (contratar um time de SDR se você vende outbound, um novo líder de ops se você vende automação) e ignore o resto. A armadilha é observar tudo: dez tipos de sinal produzem ruído, dois produzem aberturas.",
    "ladderManual": "Você vê o anúncio de captação no LinkedIn três semanas depois de todo mundo.",
    "ladderAssisted": "Contas monitoradas são escaneadas em busca de picos de contratação, captação, mudanças de tecnologia e movimentos de liderança; leads sinalizados chegam com o trigger anexado.",
    "ladderAutonomous": "Um trigger dispara e o lead entra na sequência certa no mesmo dia, com o trigger escrito na abertura."
  },
  "Web & Maps Scraping": {
    "replaces": "As listas que os bancos de dados não vendem · negócios locais, diretórios de nicho, marketplaces. Feito na mão, isso são dias de copy-paste por território, então simplesmente não é feito.",
    "notes": "É aqui que vivem as listas locais e de SMB · os grandes bancos de dados são mais fracos exatamente onde o Maps e os diretórios são mais fortes. Dados de scraping também são os dados mais sujos que você vai tocar: passe tudo por verificação antes de chegar perto de uma sequência. A armadilha é um puxão gigante e pronto · territórios mudam todo mês, e o refresh é onde está a vantagem.",
    "ladderManual": "Copiar e colar nomes de empresas do Google Maps numa planilha à 1h da manhã.",
    "ladderAssisted": "Aponte o agente para uma geografia e uma categoria; ele faz scraping, estrutura, deduplica contra puxões anteriores e devolve linhas limpas.",
    "ladderAutonomous": "Scrapings permanentes por território se atualizam no cronograma; novas aberturas aparecem no seu pipeline antes de os concorrentes saberem que existem."
  },
  "List Building": {
    "replaces": "As 2–3 horas por campanha juntando CSVs e brigando com duplicatas · e o custo reputacional quando o mesmo CEO recebe o mesmo e-mail de duas das suas sequências.",
    "notes": "A lista de supressão é a metade subestimada desse trabalho: nada incendeia a confiança como mandar Cold Email para um cliente atual ou um deal em aberto. Mantenha um único pool canônico de leads do qual toda campanha puxa, não planilhas por campanha que vão divergindo. A armadilha é deduplicar só por e-mail · deduplique por pessoa e empresa, ou o mesmo prospect com dois endereços passa duas vezes.",
    "ladderManual": "VLOOKUP, lágrimas, e a mesma pessoa em três linhas sob grafias ligeiramente diferentes.",
    "ladderAssisted": "Puxões brutos de cada fonte se juntam, deduplicam e segmentam em listas de campanha nomeadas sob comando.",
    "ladderAutonomous": "Todo job de sourcing alimenta um pool canônico; listas de campanha se montam sozinhas com supressão · clientes, deals em aberto, bounces passados · aplicada automaticamente."
  },
  "Contact Enrichment": {
    "replaces": "Uma lista que você não consegue alcançar. Sem enriquecimento, 40–60% de uma lista bruta não tem contato utilizável · pagar por leads e alcançar metade deles é o imposto silencioso de toda campanha.",
    "notes": "Waterfall é o padrão inteiro: nenhum provedor sozinho cobre mais que ~70%, então encadeie dois ou três e pegue o primeiro acerto válido. Acompanhe o custo-por-contato-encontrado por provedor e corte os piores trimestralmente. A armadilha é enriquecer antes de filtrar · pagar para achar o telefone de um lead que você nunca ia contatar. Pontue e segmente primeiro, enriqueça o que sobreviver.",
    "ladderManual": "Chutar first.last@company.com e torcer.",
    "ladderAssisted": "Enriquecimento em waterfall roda por lead · e-mail, direct dial, LinkedIn · através de múltiplos provedores, anexado ao registro.",
    "ladderAutonomous": "Todo lead que entra no pool enriquece na chegada; taxas de cobertura e custo-por-contato-encontrado monitorados por provedor."
  },
  "Email Verification": {
    "replaces": "Queima de domínio. Uma taxa de bounce de 5% não te custa 5% dos envios · ela deixa o domínio marcado, e os próximos 10.000 e-mails caem no spam.",
    "notes": "Isto é um portão, não um recurso · nada não verificado é enviado, jamais, e a taxa de bounce fica abaixo de 2%. Decida sua política de catch-all explicitamente: envie para eles num domínio separado ou não envie de jeito nenhum, mas nunca os misture no seu volume limpo. A armadilha é verificar uma vez e confiar para sempre · endereços decaem 2–3% ao mês conforme as pessoas trocam de emprego.",
    "ladderManual": "Envie e descubra.",
    "ladderAssisted": "Todo endereço passa por um verificador antes de tocar numa sequência; catch-alls e endereços arriscados são sinalizados para uma decisão.",
    "ladderAutonomous": "A verificação roda na entrada e roda de novo em qualquer lista com mais de 90 dias; qualquer coisa abaixo do limiar nunca chega a um sender."
  },
  "Fit Scoring": {
    "replaces": "Reps gastando esforço idêntico numa conta de fit perfeito e num curioso que não compra, porque a lista não sabe a diferença. A alocação de esforço é o multiplicador de tudo que vem depois.",
    "notes": "Um score que não muda comportamento é decoração · cada tier tem que receber um tratamento genuinamente diferente: profundidade da sequência, esforço de personalização, mix de canais. Calibre contra os closed-won trimestralmente: se as suas últimas dez vitórias não eram A-tier, o modelo está errado, não as vitórias. A armadilha é o modelo de 100 pontos em que ninguém confia · três tiers com regras legíveis ganham dele toda vez.",
    "ladderManual": "Ordenar por tamanho de empresa e chamar isso de priorização.",
    "ladderAssisted": "Todo lead é pontuado contra o arquivo de ICP · firmográficos, tech stack, triggers · e cai num tier antes de qualquer envio.",
    "ladderAutonomous": "Os scores são recalculados conforme o enriquecimento se atualiza; A-tier é roteado para sequências high-touch, C-tier para as de baixo custo, sem ninguém decidir lead a lead."
  },
  "Proof Matching": {
    "replaces": "Mandar o case de SaaS para o fabricante. Prova genérica soa como prova nenhuma · relevância é o que faz a evidência colar, e casar isso na mão é mais um passo que ninguém faz em escala.",
    "notes": "A estrutura da biblioteca é o trabalho de verdade: cada case marcado por vertical, problema e resultado, cada um com um número citável. Um quase-match no setor deles ganha de um número maior de um mundo diferente · compradores fazem pattern-match no “esse sou eu” antes de lerem o resultado. A armadilha é deixar o agente arredondar números para cima por efeito: a prova sai verbatim ou não sai.",
    "ladderManual": "Os mesmos dois logos em todo e-mail, não importa quem está lendo.",
    "ladderAssisted": "O agente escolhe o case de match mais próximo por prospect · setor, problema, tamanho da empresa · e escreve a prova de uma linha no rascunho.",
    "ladderAutonomous": "Toda sequência puxa a sua prova no momento da geração; um novo case entra na biblioteca e imediatamente começa a aparecer onde quer que se encaixe."
  },
  "Campaign Orchestration": {
    "replaces": "Outbound de canal único. Só e-mail dá resultados de só e-mail · toques coordenados de e-mail, LinkedIn e telefone elevam as taxas de resposta em 2–3×, mas sequenciá-los na mão através de centenas de leads é um trabalho de planejamento que ninguém sustenta.",
    "notes": "Os canais têm que saber uns dos outros: a nota do LinkedIn chega depois do e-mail dois e referencia a thread · ou não referencia nada se ela ficou sem resposta. Mapeie o arco inteiro antes do primeiro envio; enfiar coordenação numa campanha ao vivo depois é sofrimento. A armadilha é achar que mais toques significam mais respostas · 8–12 toques ao longo de três semanas, depois pare e entregue o silêncio para a Reactivation.",
    "ladderManual": "Uma sequência de e-mail aqui, alguns pedidos de conexão ali, e nenhuma relação entre eles.",
    "ladderAssisted": "O agente monta a cadência completa · qual canal, qual dia, qual mensagem · a partir dos seus assets rascunhados; um humano aprova o plano.",
    "ladderAutonomous": "As cadências se constroem por segmento a partir do playbook; o mix de canais se ajusta sozinho com base no que de fato teve resposta no último trimestre."
  },
  "Campaign Launch": {
    "replaces": "A hora de configuração chata da plataforma por campanha · e o desastre ocasional em que o token {firstName} sai cru para a lista inteira.",
    "notes": "Transforme o checklist de lançamento em código: limites diários definidos, domínio de tracking no ar, custom fields mapeados, unsubscribe funcionando, envio de teste renderizado e lido. A checagem de renderização pega a classe de falha vergonhosa · tokens de personalização quebrados · antes de qualquer um de fora ver. A armadilha é lançar para a lista inteira de uma vez: suba o volume ao longo de dias, tanto pela entregabilidade quanto para uma sequência ruim morrer aos 10% enviados em vez de 100%.",
    "ladderManual": "Copiar e colar a sequência no sender, definir os limites de memória, torcer.",
    "ladderAssisted": "Campanhas finalizadas são empurradas para a plataforma de envio com cronogramas, limites, custom fields e tracking configurados; um humano confere o envio de teste.",
    "ladderAutonomous": "Campanhas aprovadas se implantam sozinhas · configurações puxadas do playbook, envio de teste auto-renderizado e conferido, go-live registrado.",
    "human": "Um humano revisa o envio de teste renderizado antes de o volume fluir. O lançamento é o último portão onde um token quebrado não custa nada · um minuto de olhos aqui versus 2.000 desculpas depois."
  },
  "Deliverability": {
    "replaces": "O assassino silencioso de campanhas. Tudo lá em cima pode estar perfeito e nada disso importa do spam · e a maioria dos times descobre um mês de envios desperdiçados tarde demais.",
    "notes": "Arquitetura primeiro: volume frio passa por domínios secundários, nunca o seu principal · 2–3 inboxes por domínio, 30–50 envios por inbox por dia, aquecidos por 2–3 semanas antes do volume real. Daí em diante é monitoramento: testes de placement e tendências de bounce num cronograma, não quando as coisas parecem lentas. A armadilha é tratar isso como setup de uma vez só · a entregabilidade é uma maré, não um interruptor, e ela só se move numa direção quando não cuidada.",
    "ladderManual": "As taxas de resposta despencam de um penhasco e alguém eventualmente se pergunta por quê.",
    "ladderAssisted": "Testes de placement em inbox, warmup e checagens de saúde de domínio rodam no cronograma; os problemas aparecem com a correção anexada.",
    "ladderAutonomous": "Rotação, warmup e throttling de volume se autogerenciam; um domínio mostrando estresse é retirado da rotação antes de queimar."
  },
  "Send Optimization": {
    "replaces": "Disparar para todo mundo às 9h do seu fuso · incluindo os prospects para quem isso é 2h da manhã, e os provedores de inbox para quem esse pico parece exatamente spam.",
    "notes": "Só acertar o fuso horário já vale pontos reais de taxa de resposta · um email das 9h lido às 9h é um email diferente de um enterrado embaixo da pilha da madrugada. O ritmo tem que parecer humano: espalhado pelo dia útil, intervalos randomizados, nenhum pico perfeito de cron-job. A armadilha é super-ajustar as janelas de envio em amostras pequenas · você precisa de centenas de envios por célula antes que dado de timing signifique alguma coisa; até lá, manhã-do-destinatário e siga em frente.",
    "ladderManual": "Disparar pra todos e depois ficar atualizando o dashboard.",
    "ladderAssisted": "Os envios se agendam pelo fuso horário de cada destinatário e mantêm o ritmo dentro do volume seguro para o provedor; o agente propõe mudanças de janela a partir dos dados de resposta.",
    "ladderAutonomous": "O timing de envio se auto-ajusta por segmento a partir dos padrões de resposta observados; o volume flexiona pra cima e pra baixo conforme a saúde do domínio."
  },
  "Objection Response": {
    "replaces": "Re-improvisar as mesmas cinco réplicas para sempre. Todo movimento de outbound recebe as mesmas objeções · preço, timing, “já temos alguém”, “manda o material” · e a maioria dos reps responde cada uma um pouco pior que da última vez.",
    "notes": "Monte a biblioteca a partir das threads que você realmente ganhou, não de livros de vendas · suas respostas reais batem qualquer framework genérico. Cinco objeções cobrem 80% do volume; escreva uma ótima resposta por objeção por oferta e pare por aí. A armadilha é argumentar demais: as melhores respostas a objeção concedem algo verdadeiro e depois reenquadram em um parágrafo curto.",
    "ladderManual": "Você redigita sua melhor resposta de memória, um pouco diferente toda vez, geralmente mais mole.",
    "ladderAssisted": "Cada objeção classificada recebe uma resposta rascunhada a partir de uma biblioteca calibrada · sua resposta passada mais forte, adaptada a esta thread · na fila para aprovação.",
    "ladderAutonomous": "Objeções conhecidas recebem respostas da biblioteca em piloto automático com aprovação de envio; objeções inéditas são roteadas para um humano e a resposta vencedora dele entra na biblioteca.",
    "human": "A biblioteca é escrita por humanos a partir de deals realmente ganhos · a IA recupera e adapta, ela nunca inventa um novo contra-argumento que ninguém testou ao vivo."
  },
  "Hot-Lead Routing": {
    "replaces": "As horas que uma resposta interessada fica parada num inbox enquanto o prospect esfria. O interesse decai a cada hora · uma resposta quente respondida na manhã seguinte converte a uma fração de uma respondida em minutos.",
    "notes": "Isso é encanamento, não inteligência · o classificador já achou o ouro; o roteamento só se recusa a deixar ele parado. Conecte ao calendário e ao CRM no mesmo movimento pra que uma resposta quente vire um horário agendado e um registro no pipeline, não uma notificação. A armadilha é rotear com base em sinais fracos: calibre o classificador conservador, porque um alerta falso-quente por dia ensina o dono a ignorar todos eles.",
    "ladderManual": "A resposta quente é o item 47 do inbox e recebe a mesma prioridade que a newsletter.",
    "ladderAssisted": "Respostas interessadas são sinalizadas, empurradas para o dono do deal e pré-carregadas com uma resposta pronta pra agendar em minutos.",
    "ladderAutonomous": "Respostas quentes furam a fila inteira · link de calendário enviado, deal criado no estágio certo, dono notificado, tudo antes de um humano ter lido a thread."
  },
  "Speed-to-Lead": {
    "replaces": "Os dois dias entre o preenchimento de um formulário e a resposta de um founder. Leads de Inbound contatados em até cinco minutos convertem a múltiplos daqueles contatados no dia seguinte · e a maioria dos negócios é medida em dias.",
    "notes": "A primeira mensagem só tem duas tarefas: provar que um cérebro de qualidade humana leu a submissão deles e abrir o próximo passo. Referencie o que eles de fato escreveram · uma resposta que espelha a resposta do formulário deles bate qualquer template. A armadilha é soar como um autoresponder; se a mensagem poderia ter sido enviada sem ler a submissão, reescreva o sistema.",
    "ladderManual": "O lead preenche o formulário na terça, recebe resposta na quinta, fechou com outra pessoa na quarta.",
    "ladderAssisted": "Todo lead de Inbound recebe uma confirmação em minutos · pessoal no tom, específica ao que eles perguntaram · com o humano incluído na conversa de verdade.",
    "ladderAutonomous": "Primeira resposta, pergunta de qualificação e link de agendamento disparam em até cinco minutos, 24 horas por dia; o humano acorda com calls agendadas, não com formulários crus."
  },
  "Lead Qualification": {
    "replaces": "30–45 minutos de call de discovery por lead que nunca deveria ter sido agendado. Calls não qualificadas são a forma mais cara de descobrir que alguém não tem budget.",
    "notes": "O formulário de intake é a construção de verdade: faça três perguntas que preveem fechamento · faixa de budget, problema nas palavras deles, prazo · e a pontuação fica trivial. Pontue contra o seu padrão de closed-won, não contra um ICP aspiracional. A armadilha é super-filtrar cedo: registre todo lead auto-recusado e audite a lista mensalmente até você confiar na linha.",
    "ladderManual": "Todo mundo que agenda ganha uma call; você descobre que é um estudante com uma dúvida no minuto quatro.",
    "ladderAssisted": "Respostas do intake parseadas e pontuadas contra o seu ICP · budget, fit, urgência · com uma rota recomendada (agendar, nutrir, recusar) antes de um humano olhar.",
    "ladderAutonomous": "Leads qualificados agendam direto no calendário, os marginais entram numa trilha de nutrição, e os fits ruins recebem um redirecionamento educado · nenhuma triagem humana.",
    "human": "A IA pontua e ordena; um humano é dono de onde fica a linha de desqualificação e audita as auto-recusas. Farejar o lead de fit ruim que secretamente é uma exceção estratégica continua sendo uma questão de julgamento."
  },
  "Comment-CTA Fulfillment": {
    "replaces": "Mandar DM manualmente com um link para 400 comentaristas · o que significa ou horas no celular depois de todo post que estoura, ou promessas quebradas exatamente para as pessoas que levantaram a mão.",
    "notes": "Essa é a ponte entre conteúdo e pipeline: o comentário é uma mão levantada, a DM é a captura, o material é a desculpa. Coloque o material atrás de um email e a máquina de conteúdo começa a alimentar o CRM diretamente. A armadilha é parar na entrega · marque cada lead com qual material ele pediu, porque essa tag é dado de targeting para tudo lá na frente.",
    "ladderManual": "Você manda as primeiras 30 DMs no dedo, perde o gás, e os outros 370 comentaristas não recebem nada.",
    "ladderAssisted": "Comentários com palavra-chave detectados por post; o material prometido sai por DM a partir de uma fila que um humano pode acompanhar.",
    "ladderAutonomous": "Todo post com CTA-de-comentário se cumpre sozinho · palavra-chave detectada, material entregue, email capturado, lead marcado por qual material ele quis · em qualquer volume, em qualquer hora."
  },
  "Inbox Triage": {
    "replaces": "O founder como uma máquina humana de triagem · 60–90 minutos por dia decidindo o que cada mensagem sequer é antes de qualquer trabalho de verdade começar, com as importantes enterradas embaixo do ruído.",
    "notes": "Triagem é classificação mais roteamento · a tag não vale nada a menos que algo aconteça por causa dela: leads para o pipeline, itens de cliente para o contexto do projeto, ruído para o arquivo. Comece com no máximo cinco categorias; precisão bate granularidade. A armadilha é o arquivamento errado e silencioso · mantenha uma auditoria semanal do que foi marcado como ruído, porque um email de cliente arquivado por engano custa mais do que o sistema economiza.",
    "ladderManual": "Tudo está não lido, tudo é urgente, o email do cliente de terça aparece na sexta.",
    "ladderAssisted": "Todo email e DM de entrada marcado na chegada · cliente, lead, brand deal, admin, ruído · com os itens de responder-obrigatório destacados primeiro.",
    "ladderAutonomous": "O inbox se organiza continuamente; ruído nunca chega a um humano, leads são roteados para o pipeline, mensagens de cliente sinalizam o projeto certo, e você trabalha uma fila ranqueada em vez de uma timeline."
  },
  "Follow-Up Drafting": {
    "replaces": "O email de recap que sai dois dias atrasado ou nunca. Deals perdem momentum no intervalo entre a call e o Follow-Up · e o intervalo geralmente é só o vendedor estando ocupado.",
    "notes": "Velocidade é a feature: um recap na mesma hora chega enquanto o prospect ainda sente a call, e ele silenciosamente fixa a versão dos fatos nos seus termos. Mantenha curto · decisões, próximos passos com donos e datas, uma linha olhando pra frente. A armadilha é mandar um resumo de transcrição em vez de um documento de vendas; o recap deve avançar o deal, não virar ata da reunião.",
    "ladderManual": "Você pretende mandar o recap hoje à noite; hoje à noite vira quinta; quinta vira “dando um Follow-Up na nossa conversa da semana passada”.",
    "ladderAssisted": "O recap se rascunha a partir da transcrição em minutos após desligar · o que foi combinado, próximos passos, donos · esperando nos rascunhos por uma lida e um envio.",
    "ladderAutonomous": "Toda call externa produz seu Follow-Up automaticamente; o humano edita a nuance ocasional, e recaps na mesma hora viram o padrão da casa."
  },
  "Agreement Drafting": {
    "replaces": "O intervalo de 3–10 dias entre o “sim” e a papelada, onde fechamentos verbais vão morrer. Mais $300–800 de tempo de advogado por contrato se você redigir cada um do zero em vez de fazer template uma vez.",
    "notes": "Envie o contrato no mesmo dia do sim verbal · momentum é uma ferramenta de fechamento e todo dia de silêncio convida dúvidas de última hora. Passe o template mestre por um advogado uma vez, e depois nunca mais improvise a linguagem jurídica; o trabalho da IA é preencher variáveis, não escrever cláusulas. A armadilha é deixar “pequenos ajustes” por deal forkarem o template até que nenhum contrato seja igual ao outro.",
    "ladderManual": "Você caça o contrato do último cliente, dá find-and-replace no nome dele, e deixa passar uma ocorrência na cláusula 9.",
    "ladderAssisted": "No momento em que um deal fecha verbalmente, o contrato é gerado a partir do registro do deal · partes, escopo, honorários, termos · dentro do template aprovado pelo advogado, pronto para revisão humana e assinatura.",
    "ladderAutonomous": "A mudança de estágio para closed-won dispara o contrato, roteia para assinatura eletrônica, e persegue os não assinados · o humano só toca em deals com termos fora do padrão.",
    "human": "Um advogado abençoa o template mestre uma vez; um humano revisa todo contrato gerado antes de ele sair. A IA preenche e adapta · ela nunca inventa uma cláusula."
  },
  "Pricing Support": {
    "replaces": "Precificar no feeling e ancorar baixo sob pressão. A hora de conta de comparação com FTE e de estruturação em fases que justifica um número 2–3× maior · feita direito para deals grandes, pulada para o resto.",
    "notes": "Ancore contra o custo da alternativa, não contra o seu próprio esforço · a comparação com um salário, um retainer de agência, ou o custo do problema persistir é o que faz um número parecer pequeno. Estruture em fases para que o primeiro sim seja fácil e o relacionamento precifique o resto. A armadilha é deixar a opção intermediária do modelo virar um teto; a conta existe para defender ambição, não para limitá-la.",
    "ladderManual": "Você escolhe um número na call, sente ele tremer, e dá desconto antes de alguém te pedir.",
    "ladderAssisted": "Por deal: comparações de ancoragem, estruturas em fases e conta de ROI modeladas a partir do contexto do discovery · três opções defensáveis com o raciocínio anexado, antes da conversa de preço.",
    "ladderAutonomous": "Todo deal que entra no estágio de proposta chega com seu modelo de precificação pré-montado · deals passados comparáveis, âncora sugerida, quebra em fases · e o humano escolhe em vez de calcular.",
    "human": "A IA modela as estruturas; o humano escolhe o número. Preço é posicionamento, alavancagem e leitura de sala · o valor final de todo deal é uma decisão humana, nunca um output de modelo."
  },
  "CRM Hygiene": {
    "replaces": "Os 10–20% de registros que são duplicados, mortos ou errados · e todo relatório, forecast e automação silenciosamente construídos em cima deles. Higiene lixo taxa todo nó lá na frente.",
    "notes": "Higiene é o pré-requisito nada glamoroso para todo o ramo de Pipeline Ops · reporting, forecasting e reativação todos leem desses registros, e herdam cada erro. Defina as regras de “estágio honesto” por escrito (qual evidência move um deal pra frente) e deixe o sistema aplicá-las. A armadilha é o mutirão trimestral de limpeza: higiene é um processo permanente, não um evento, e um CRM limpo uma vez decai em semanas.",
    "ladderManual": "Três registros para a mesma empresa, um deal marcado como “proposta” desde março, e ninguém confia no dashboard.",
    "ladderAssisted": "Candidatos a deduplicação, estágios parados e campos faltando aparecem numa agenda com correções propostas; um humano aprova o merge.",
    "ladderAutonomous": "Registros se deduplicam e se normalizam continuamente, estágios envelhecem com avisos ao dono, e toda nova entrada se conforma na chegada · o CRM permanece fiel sem um dia de limpeza."
  },
  "Pipeline Reporting": {
    "replaces": "A hora de segunda-feira montando o estado do pipeline na mão · ou a alternativa mais comum, tocar o negócio com base no que o founder lembra que o pipeline parecia.",
    "notes": "Reporte movimento, não estado · “o que mudou desde a semana passada” é o valor inteiro, e um snapshot estático do pipeline é só um screenshot com cerimônia. Inclua uma seção de deals parados com dias-desde-o-último-contato; é a linha mais acionável do relatório. A armadilha é o inchaço de métricas: uma página, mesmo formato toda semana, pra que os desvios saltem em vez de se esconder no ruído.",
    "ladderManual": "Alguém rola o CRM antes da reunião e narra de memória.",
    "ladderAssisted": "Um digest semanal chega na hora certa: o que se moveu, o que parou, o que fecha em seguida, e quais deals ficaram em silêncio · com os deltas, não só os totais.",
    "ladderAutonomous": "O relatório se escreve e se distribui sozinho, sinaliza anomalias entre edições, e responde perguntas ad-hoc sobre o pipeline sob demanda · a reunião lê o relatório em vez de montá-lo."
  },
  "Forecasting": {
    "replaces": "Surpresas de receita nas duas direções. O número do founder geralmente é ponderado por esperança, não por probabilidade · e o gap entre eles são os meses de runway que você não sabia que estavam faltando.",
    "notes": "Acompanhe forecast-versus-real desde o dia um · o modelo conquista confiança sendo auditável, e três meses de placar batem qualquer debate de metodologia. Pese comportamento (engajamento, momentum, dias-no-estágio) mais do que rótulos de estágio, que na maioria das vezes registram o que o vendedor torceu. A armadilha é a falsa precisão: um forecast com uma faixa e premissas visíveis é útil; um único número confiante é teatro.",
    "ladderManual": "Você soma o pipeline, multiplica por otimismo, e chama isso de forecast.",
    "ladderAssisted": "Deals ponderados por probabilidade por estágio, idade e sinais de engajamento em um forecast mensal de receita · com as premissas visíveis, pra que um humano possa discordar delas.",
    "ladderAutonomous": "O forecast se atualiza conforme os deals se movem, aprende com os próprios erros, e sinaliza o gap entre o número do modelo e o do dono · que é geralmente onde a verdade mora.",
    "human": "O modelo pondera o pipeline; o dono do deal ajusta as previsões. Um humano que acabou de sair da sala sabe coisas que nenhuma probabilidade-de-estágio jamais saberá · o forecast é um rascunho até que alguém responsável o assine."
  },
  "Win/Loss Analysis": {
    "replaces": "Pagar a matrícula cheia por cada deal perdido e não guardar nada da lição. A maioria dos times não sabe dizer por que suas últimas cinco perdas morreram além de “preço” · que quase nunca é o motivo real.",
    "notes": "A taxonomia é a construção: oito a doze motivos fixos, escolha forçada, texto livre opcional · perdas não categorizadas são perdas inanalisáveis. Minere as transcrições das calls, não a lembrança do vendedor; o motivo real geralmente é dito em voz alta em algum ponto da segunda call. A armadilha é coletar tags e nunca fechar o loop · a análise só se paga quando muda o ICP, o pitch ou o preço.",
    "ladderManual": "Um dar de ombros, um “eles foram por outro caminho”, e o mesmo erro no trimestre seguinte.",
    "ladderAssisted": "Todo deal fechado recebe uma tag com um motivo estruturado, tirado das transcrições e do histórico de threads em vez da memória do vendedor; os padrões se compilam trimestralmente.",
    "ladderAutonomous": "Padrões de perda aparecem conforme se formam · uma vertical esfriando, uma objeção em alta, um concorrente ganhando na mesma linha · e realimentam diretamente o targeting e a biblioteca de objeções.",
    "human": "O vendedor que perdeu escreve o primeiro rascunho do porquê · depois alguém que não estava no deal lê com ceticismo. Motivos de perda auto-reportados são onde os pipelines mentem para si mesmos com mais fluência."
  },
  "Audience Analysis": {
    "replaces": "Ler comentários por dopamina em vez de por dado. Sua audiência te diz exatamente o que fazer em seguida, todo dia, por escrito · e quase ninguém registra isso.",
    "notes": "Objeções são o ouro · uma pergunta feita três vezes nos comentários é um reel, um guia e um email em um só. Canalize o output para o Hook Writing pra que a demanda dirija a criação, não o contrário. A armadilha é minerar só seus vencedores: os comentários nos posts medianos te dizem por que eles foram medianos.",
    "ladderManual": "Você vagamente lembra que alguém perguntou sobre preço uma vez.",
    "ladderAssisted": "Comentários e DMs minerados numa agenda · perguntas, objeções e dor recorrente extraídas para uma fila ranqueada de ideias de conteúdo.",
    "ladderAutonomous": "Todo comentário e DM alimenta um mapa de demanda permanente; novas objeções são roteadas para a fila de ideias e para o doc de oferta sem ninguém rolar a tela."
  },
  "Script Writing": {
    "replaces": "2–3 horas por roteiro feito direito, ou $150–500 por roteiro de um freelancer que não soa como você. Numa cadência de postagem diária isso é uma contratação part-time.",
    "notes": "O arquivo de voz é a construção inteira · alimente-o com transcrições reais do seu conteúdo de melhor performance, não com seus posts escritos, porque voz falada e voz escrita são animais diferentes. Estrutura bate inspiração: hook → tensão → payoff → CTA, toda vez. A armadilha são roteiros que leem bem e falam mal · leia todo rascunho em voz alta antes de aprová-lo.",
    "ladderManual": "Você improvisa na frente da câmera e torce pra que o take quatro tenha um final.",
    "ladderAssisted": "Roteiros completos rascunhados na voz da casa a partir de um hook e um ângulo · estrutura, beats, CTA · humano edita antes de filmar.",
    "ladderAutonomous": "Toda ideia na fila chega roteirizada em duas ou três variações; dados de performance ajustam a estrutura mensalmente."
  },
  "Caption Writing": {
    "replaces": "Os 20 minutos por post que acontecem depois que a energia criativa já foi gasta · e é por isso que a maioria das legendas é um penduricalho grampeado num bom conteúdo.",
    "notes": "Codifique as regras de plataforma uma vez como restrições rígidas · onde fica o CTA, quantas hashtags, como a primeira linha trunca no feed · e o agente nunca as viola às 23h do jeito que um humano cansado viola. A primeira linha é um segundo hook: ela aparece antes do toque. A armadilha é uma legenda colada em todo lugar; uma legenda de LinkedIn e uma legenda de TikTok compartilham uma ideia, não uma estrutura.",
    "ladderManual": "Emoji, três hashtags, postar, arrepender.",
    "ladderAssisted": "Legendas corretas por plataforma rascunhadas por asset · posicionamento de CTA, limites de hashtag e regras de quebra de linha embutidos · humano aprova.",
    "ladderAutonomous": "Todo post na fila carrega suas variantes de legenda; as regras se atualizam sozinhas conforme as plataformas mudam o que funciona."
  },
  "Carousel Production": {
    "replaces": "$100–300 por carrossel de um designer com um prazo de entrega de 3 dias, ou 2–4 horas de tempo do founder por conjunto brigando com uma ferramenta de arrastar-e-soltar.",
    "notes": "Construa o design system uma vez como código · templates, escala tipográfica, espaçamento, posicionamento de logo · daí todo carrossel é um problema de conteúdo, não um problema de design. O slide um é um hook com o mesmo peso de um hook de vídeo; os slides dois a seis conquistam o swipe um de cada vez. A armadilha é redesenhar por carrossel: trave o sistema e deixe a consistência virar a marca.",
    "ladderManual": "Canva, dez slides, fontes fugindo do padrão lá pelo slide seis.",
    "ladderAssisted": "Slides gerados a partir de um design system travado · copy entra, PNGs com a marca saem · humano revisa o conjunto antes de exportar.",
    "ladderAutonomous": "Ideias vencedoras disparam rascunhos de carrossel automaticamente; o pipeline de exportação renderiza e os coloca na fila para publicação."
  },
  "Video Production": {
    "replaces": "$50–150 por reel para um editor com um prazo de entrega de 2–5 dias · e o prazo é o custo real, porque conteúdo de trend morre esperando na fila de alguém.",
    "notes": "Vídeo programático significa edições definidas em código, o que significa que todo problema resolvido · estilização de legenda, transições, timing de overlay · vira um primitivo reutilizável em vez de uma lembrança. Construa a biblioteca de primitivos primeiro; o segundo vídeo custa um décimo do primeiro. A armadilha é tratar cada vídeo como um projeto do zero: copie o último template que funcionou, sempre.",
    "ladderManual": "Você aprende a timeline de um editor de vídeo à meia-noite, uma vez, mal.",
    "ladderAssisted": "Gravações recebem overlays, legendas e motion graphics aplicados programaticamente a partir de uma biblioteca de componentes reutilizável; humano revisa o render.",
    "ladderAutonomous": "Jogue uma gravação numa pasta e uma edição finalizada, legendada e na identidade da marca sai · variantes incluídas, na fila para revisão."
  },
  "Deck Production": {
    "replaces": "6–10 horas por deck de webinar, ou $500–1,500 para um designer que precisa do conteúdo de qualquer jeito · ou seja, você faz o raciocínio duas vezes.",
    "notes": "Trave três ou quatro padrões de slide mestre · capa, conteúdo, prova, CTA · e todo deck vira montagem, não design. O deck é um asset de vendas vestido de fantasia de educação: os slides de prova e o fechamento merecem o maior número de iterações. A armadilha é o drift de template · um deck construído fora do sistema e todo deck depois dele herda a mutação.",
    "ladderManual": "O deck do trimestre passado com datas novas e um gráfico novo.",
    "ladderAssisted": "Esboço da palestra entra, deck com a marca sai · design system da casa, assets reais, tipografia consistente · humano edita a narrativa.",
    "ladderAutonomous": "Toda palestra ou webinar agendado dispara um rascunho de deck a partir do tema e da base de conhecimento; você entra e ensaia em vez de montar."
  },
  "Clip Extraction": {
    "replaces": "$1–2k/mês de agências de clipagem, ou um editor cobrando horas pra assistir às gravações. Um webinar de uma hora guarda 5–10 clips postáveis que na maioria morrem sem serem vistos numa pasta de gravações.",
    "notes": "Selecione a partir da transcrição, não da timeline · ler uma hora leva quatro minutos, assistir leva uma hora. Um clip merece ser postado só se funciona com zero contexto: uma afirmação completa, uma história completa, ou uma resposta completa. A armadilha é a adoração ao volume · dez clips medianos de uma gravação treinam a audiência a te pular; publique os dois que se sustentam sozinhos.",
    "ladderManual": "Você pretendia clipar o webinar. Isso foi três webinars atrás.",
    "ladderAssisted": "Gravações longas transcritas e escaneadas em busca de momentos autônomos · afirmações fortes, histórias, respostas · cortadas e legendadas para revisão.",
    "ladderAutonomous": "Toda gravação longa que chega dispara a extração; clips ranqueados chegam legendados e na fila, sem ninguém pedir."
  },
  "Publishing": {
    "replaces": "A tarefa diária de postar que sobrevive exatamente até a primeira semana corrida. Inconsistência é a assassina silenciosa de todo flywheel de conteúdo · o algoritmo esquece mais rápido do que você se recupera.",
    "notes": "Poste via API, não via automação de navegador · as APIs de plataforma são o caminho estável e o seguro para a conta. Construa a fila com um runway visível: saber que você tem nove dias de conteúdo aprovado no banco muda como você cria. A armadilha é ir para o piloto automático total no dia um; rode fila-mais-aprovação por um mês antes de deixar qualquer coisa sair sem ser vista.",
    "ladderManual": "Celular na mão, app aberto, colar, postar, repetir por plataforma · quando você lembra.",
    "ladderAssisted": "Conteúdo aprovado agendado e postado entre plataformas via API; a fila mostra o que sai quando, e os buracos são sinalizados.",
    "ladderAutonomous": "O pipeline roda criação → legenda → fila → post em cadência; um humano cura a fila, o sistema nunca perde um dia.",
    "human": "Um humano dá uma olhada em conta, legenda e asset antes de cada lote agendado ir ao ar. Um post na conta errada é um screenshot para sempre · a checagem de dois minutos é inegociável."
  },
  "Newsletter & Broadcast": {
    "replaces": "3–5 horas/semana de escrever e formatar, ou $500–1k/mês para um ghostwriter · e a edição que silenciosamente pula uma semana, depois duas, e aí a lista esfria.",
    "notes": "Construa o template HTML uma vez no sistema da marca e nunca mais desenhe uma edição · o trabalho semanal vira puro editorial. Colha, não escreva: a newsletter deve ser montada a partir de conteúdo e trabalho que já existe, com uma opinião original por cima. A armadilha é tratá-la como um broadcast em vez de um asset · a lista é a única audiência que você é dono; todo o resto é alugado.",
    "ladderManual": "Domingo à noite, editor em branco, “o que aconteceu essa semana?”",
    "ladderAssisted": "O conteúdo e as vitórias da semana colhidos em uma edição desenhada no template da marca · humano edita as opiniões, aperta enviar.",
    "ladderAutonomous": "A edição se monta sozinha na agenda a partir do trabalho entregue na semana; você revisa na quinta, ela envia na sexta, toda semana, para sempre."
  },
  "SEO & GEO": {
    "replaces": "Contratos mensais de SEO de $1–3k que na maior parte só produzem relatórios · ou ser invisível à fatia crescente de compradores que pedem uma recomendação a um LLM em vez de pesquisar.",
    "notes": "GEO · ser legível e citável pelos LLMs · é a parte sobre a qual a maioria dos sites não fez nada, e é basicamente a mesma higiene de um SEO bem feito: estrutura clara, structured data, declarações diretas do que você faz e para quem. Faça a passada de fundação numa sessão só: sitemap, robots, schema markup, llms.txt. A armadilha é correr atrás de keywords antes de consertar a legibilidade · um site que a máquina não consegue interpretar perde em toda query, otimizado ou não.",
    "ladderManual": "Alguém instalou um plugin de SEO em 2023 e o site está “otimizado” desde então.",
    "ladderAssisted": "Sitemap, structured data, metadata e um llms.txt gerados e mantidos a partir do conteúdo real do site; lacunas auditadas sob demanda.",
    "ladderAutonomous": "Toda página nova sai pré-otimizada tanto para crawlers quanto para LLMs; checagens de ranking e de citação por IA rodam no cronograma e sinalizam desvio."
  },
  "OG & Share Surface": {
    "replaces": "Links que abrem como um retângulo cinza em branco em cada DM, Slack e compartilhamento no LinkedIn. Cada link pelado é um pequeno imposto de credibilidade, pago exatamente na superfície por onde seu conteúdo circula.",
    "notes": "Gere imagens OG programaticamente a partir de uma rota de template, não como arquivos de design · o título, o tipo de página e o frame de marca se compõem no momento da requisição e conteúdo novo fica coberto para sempre. Teste a prévia do link onde ela de fato acontece: um app de mensagens, um rascunho no LinkedIn, uma caixa de composição no X. A armadilha é uma imagem genérica para o site inteiro; cards por página com o título real recebem mensuravelmente mais cliques porque leem como conteúdo, não como logo.",
    "ladderManual": "Uma og-image estática subida no lançamento, dimensões erradas, nunca atualizada.",
    "ladderAssisted": "Uma imagem OG em template por tipo de página · título puxado, brand system aplicado · gerada em build time.",
    "ladderAutonomous": "Toda página e post sai com seu share card renderizado automaticamente; rotas novas herdam o sistema com zero trabalho extra."
  },
  "Deal Scripting": {
    "replaces": "Dias de vai-e-volta por roteiro patrocinado, com ciclos de revisão comendo silenciosamente a margem do deal. Um brand deal de $5k com quatro rodadas de revisão é um brand deal de $2k.",
    "notes": "Envie três variações, não uma · patrocinadores que escolhem entre opções aprovam mais rápido do que patrocinadores a quem se pede julgar uma única versão. Ancore todo roteiro num formato que seus próprios dados dizem que funciona; a marca comprou sua audiência, e sua audiência veio pelo seu formato. A armadilha é deixar o briefing achatar a voz · um post patrocinado que soa como anúncio performa como anúncio, o que não serve a ninguém que pagou por ele.",
    "ladderManual": "A marca manda um briefing; você procrastina, depois escreve algo que nenhum dos dois ama.",
    "ladderAssisted": "Briefing entra, três variações de roteiro saem · formato comprovado, claims reais do produto checados, voz do creator intacta · o patrocinador escolhe uma.",
    "ladderAutonomous": "Deals assinados disparam variações roteirizadas automaticamente a partir do briefing mais seus formatos de melhor performance; humanos cuidam da aprovação, não do rascunho.",
    "human": "Duas aprovações, ambas humanas: o patrocinador assina embaixo dos claims, e o creator aprova cada linha falada em seu nome. Nunca deixe um agente inventar um claim de capacidade para o produto de outra pessoa · faça o fact-check antes de ir para a câmera."
  },
  "Approval Docs": {
    "replaces": "Versões de roteiro espalhadas por threads de email e chat, mais 30–60 minutos por deal de formatação · multiplicado por cada rodada de revisão que a própria bagunça cria.",
    "notes": "Um doc canônico por deal, edições no doc, nunca no chat · o trabalho inteiro é matar a ambiguidade de versão. Uma convenção de nomenclatura consistente e um formato limpo também fazem um trabalho silencioso de vendas: patrocinadores julgam profissionalismo pelos artefatos, e papelada organizada conquista o segundo deal. A armadilha é o excesso de compartilhamento · limite o acesso ao arquivo único, não ao seu drive inteiro.",
    "ladderManual": "A versão 3 está no email, a versão 4 está no WhatsApp, a marca aprovou a versão 2.",
    "ladderAssisted": "O roteiro travado cai num doc formatado limpo e brand-safe · nomenclatura consistente, estrutura adequada · pronto para o sign-off do patrocinador.",
    "ladderAutonomous": "Roteiros finais geram seu doc de aprovação automaticamente, arquivados por marca, compartilhados com acesso de escopo mínimo; revisões atualizam um único documento canônico."
  },
  "Kickoff Pack": {
    "replaces": "A zona morta de 3–5 dias entre a assinatura e o primeiro trabalho real · a janela onde mora o arrependimento do comprador. Mais 2–3 horas montando o mesmo email de boas-vindas, checklist e estrutura de pastas para cada novo cliente.",
    "notes": "A velocidade aqui dá o tom de todo o engajamento: um kickoff pack que chega poucas horas depois da assinatura diz ao cliente que ele comprou de operadores. Faça o template do pack uma vez · email de boas-vindas, timeline do que-acontece-a-seguir, checklist de acessos · e personalize a partir do registro do deal, não do zero. A armadilha é encher demais: um email, um checklist, um próximo passo claro. Qualquer coisa além disso é ignorada.",
    "ladderManual": "O cliente assina, depois não ouve mais nada até alguém achar uma tarde livre.",
    "ladderAssisted": "Deal fecha → email de boas-vindas, checklist de acessos e pasta do projeto rascunhados a partir do registro do deal; o delivery lead revisa e envia no mesmo dia.",
    "ladderAutonomous": "O contrato assinado dispara o pack completo automaticamente · email enviado, checklist no ar, scaffold construído · antes da mensagem comemorativa no Slack.",
    "human": "O delivery lead envia o email de boas-vindas com o próprio nome e é dono da data de kickoff que ele promete. O pack se monta sozinho; o compromisso é humano."
  },
  "Access Collection": {
    "replaces": "As 1–2 semanas de “ainda esperando aquela API key” que atrasam todo início de build · a causa mais comum de derrapagem na primeira semana, e não fatura para ninguém.",
    "notes": "A verificação é a metade que todo mundo pula: uma chave que chega não é uma chave que funciona · escopos errados, tokens expirados e credenciais só de sandbox aparecem no meio do build se você não testar no recebimento. Derive o checklist das integrações realmente escopadas, não de um template genérico. Armadilha a evitar: marcar itens como completos quando chegam em vez de quando verificam.",
    "ladderManual": "Você manda email pedindo as credenciais, eles enviam a metade, você percebe a lacuna no meio do build.",
    "ladderAssisted": "Um checklist gerado por projeto a partir do stack escopado; o agente persegue os itens pendentes num cronograma e verifica que cada credencial de fato funciona no recebimento.",
    "ladderAutonomous": "Toda chave recebida é testada com uma chamada na hora, lacunas são reperseguidas automaticamente, e o build recebe sinal verde só quando o conjunto completo verifica.",
    "human": "As credenciais são manuseadas por um humano nomeado direto num secrets store adequado · nunca coladas no chat, nunca guardadas no contexto do agente. O agente persegue e verifica; ele não segura as chaves."
  },
  "Project Scaffolding": {
    "replaces": "A meia-diária de setup antes de qualquer trabalho real começar · repo, arquivos de contexto, convenções de pastas, doc de plano · feita um pouco diferente toda vez, então dois projetos nunca são navegáveis da mesma forma.",
    "notes": "O produto real aqui é consistência: quando todo engajamento tem o mesmo esqueleto, qualquer agente ou humano pode entrar em qualquer projeto e se orientar numa leitura. Puxe o contexto inicial do registro do deal e das transcrições de discovery · o processo de vendas já capturou a maior parte; perguntar de novo ao cliente é admitir que você não conversa consigo mesmo. Mantenha o template mínimo: scaffolds que exigem vinte arquivos são abandonados no arquivo seis.",
    "ladderManual": "Todo projeto começa como uma pasta vazia e a memória de alguém sobre como o último foi estruturado.",
    "ladderAssisted": "Um comando levanta o repo, o arquivo de contexto do cliente, o doc de plano e as convenções de pastas a partir do template da casa; um humano preenche as especificidades do engajamento.",
    "ladderAutonomous": "O deal fechado dispara o scaffold automaticamente · pré-preenchido com tudo que o processo de vendas já aprendeu sobre o cliente."
  },
  "Integration Builds": {
    "replaces": "O trabalho faturável central de uma operação de automação · e a parte onde o escopo cresce silenciosamente. Feita à mão, cada integração são dias lendo docs de API, lidando com auth e descobrindo que a documentação do fornecedor mentiu.",
    "notes": "Construa a biblioteca de padrões deliberadamente: toda integração que você entrega vira um template reutilizável, e lá pelo décimo projeto a maioria dos builds é montagem, não invenção. Sempre construa contra os dados reais do cliente cedo · dados de sandbox escondem os edge cases que explodem as demos. A armadilha é pular o tratamento de retry e de falha porque o happy path funcionou: integrações não falham no teste, elas falham às 2h da manhã no dia quarenta.",
    "ladderManual": "Um desenvolvedor lê as docs da API, escreve a cola e encontra o rate limit não documentado em produção.",
    "ladderAssisted": "O agente escreve a integração · auth, endpoints, tratamento de erros, retries · contra credenciais verificadas; um humano revisa o código e roda contra dados reais.",
    "ladderAutonomous": "Integrações padrão (CRM, calendário, transcrições, pagamentos) se montam a partir de uma biblioteca de padrões comprovada; humanos só tocam nas genuinamente inéditas."
  },
  "Portal Provisioning": {
    "replaces": "O email de “consegue me mandar um update?” e o deck de status reconstruído antes de toda call de check-in · 2–3 horas/semana por cliente ativo de puro teatro de performance.",
    "notes": "Um template, imposto com rigor · o valor é que todo portal de cliente parece e funciona identicamente, então o provisionamento é questão de minutos, não um projeto de design. Dê ao cliente algo para fazer nele (marcar itens de onboarding, responder perguntas em aberto) e ele vira uma superfície de trabalho em vez de um folheto. A armadilha: um portal que fica atrás da realidade é pior que nenhum portal · não entregue isso sem o Portal Sync planejado, ou vira mais uma coisa para atualizar manualmente.",
    "ladderManual": "O status vive em threads de email e no que quer que o cliente lembre da última call.",
    "ladderAssisted": "Um portal com marca e escopo por cliente, levantado a partir de um template por engajamento · roadmap, checklist de onboarding, entregáveis · atualizado pelo time conforme o trabalho é entregue.",
    "ladderAutonomous": "Novos engajamentos ganham um portal automaticamente, e o sistema de delivery escreve nele diretamente: o cliente assiste o progresso acontecer em vez de perguntar sobre ele."
  },
  "QA & Verification": {
    "replaces": "O bug que o cliente encontra antes de você. Todo defeito que chega a um cliente custa mais confiança do que dez pegos internamente · e o retrabalho come 10–20% das horas de delivery em firmas que entregam no feeling.",
    "notes": "O padrão é verificar-antes-de-concluir: um build não está pronto quando funciona, está pronto quando foi demonstrado que funciona contra dados reais, edge cases incluídos. Escreva o checklist por tipo de build uma vez e reutilize · builds de extração, builds de integração e portais falham cada um de formas características. A armadilha é testar com dados de amostra limpos: os documentos reais do cliente são mais feios do que qualquer coisa que você inventaria, e essa feiura é exatamente o que você está sendo pago para lidar.",
    "ladderManual": "O desenvolvedor que construiu clica por tudo uma vez e declara vitória.",
    "ladderAssisted": "Todo build roda contra dados reais do cliente através de um checklist de verificação · edge cases, modos de falha, acurácia do output · com resultados logados antes de qualquer coisa ir para demo.",
    "ladderAutonomous": "A verificação roda em toda mudança automaticamente; builds fisicamente não conseguem chegar à camada voltada ao cliente sem um run aprovado registrado.",
    "human": "Um humano dá o sign-off antes de qualquer coisa ser mostrada a um cliente · o agente roda as checagens, mas o nome no engajamento é dono do padrão. O sign-off de QA nunca é delegado à própria coisa que está sob QA."
  },
  "Status Updates": {
    "replaces": "O email de update que leva 30 minutos para escrever por cliente por semana · ou não é escrito, que é como os clientes concluem que nada está acontecendo. O silêncio lê como enrolação mesmo quando o trabalho está voando.",
    "notes": "Cadência bate conteúdo: um update curto toda semana supera um brilhante uma vez por mês, porque o próprio ritmo é a tranquilização. Gere a partir de atividade real · arquivos de contexto, commits, entregáveis enviados · nunca a partir de um humano resumindo a semana num formulário, ou o sistema morre em quinze dias. A armadilha: nunca deixe o update automatizado ser o canal para más notícias. Atrasos e problemas ganham uma call humana primeiro, o update escrito depois.",
    "ladderManual": "O cliente pergunta como está indo; alguém reconstrói a semana da memória e do Slack.",
    "ladderAssisted": "Um update semanal se rascunha a partir do arquivo de contexto e do trabalho entregue · o que andou, o que vem a seguir, o que está bloqueado · e o delivery lead edita e envia.",
    "ladderAutonomous": "Updates publicam no cronograma para email e para o portal, gerados a partir da atividade real de delivery, com o humano só entrando quando há má notícia para enquadrar.",
    "human": "Boa notícia pode ir no piloto automático; má notícia não. Um humano entrega todo atraso ou problema pessoalmente antes que apareça por escrito."
  },
  "Portal Sync": {
    "replaces": "A lacuna entre trabalho feito e trabalho visível. Sem isso, o portal decai para um folheto em duas semanas e você volta a atualizar manualmente dois lugares · o trabalho e a história sobre o trabalho.",
    "notes": "Este é o nó que torna o Portal Provisioning honesto: o portal só vale o que ele reflete, e a atualização manual é o modo de falha que mata todo dashboard voltado ao cliente já construído. Amarre o sync ao fim natural do trabalho · fechamento de sessão, entregável enviado, milestone batido · não a um ritual de update separado. A armadilha é sincronizar as tripas cruas: o cliente deveria ver o progresso na linguagem dele, não o seu commit log.",
    "ladderManual": "Alguém lembra de atualizar o portal depois de entregar. Não lembra.",
    "ladderAssisted": "Resumos de fim de sessão e entregáveis finalizados rascunhados em updates do portal; um humano aprova o que o cliente vê.",
    "ladderAutonomous": "Toda sessão de trabalho escreve seu resumo no portal automaticamente · a visão do cliente e a realidade nunca se descolam."
  },
  "Transcript Processing": {
    "replaces": "Reuniões que evaporam. Toda call de cliente contém decisões, compromissos e contexto que valem dinheiro · e na maioria das firmas isso não vive em lugar nenhum além da memória desbotada de duas pessoas sobre uma terça-feira.",
    "notes": "O Call Capture grava a reunião; este nó a torna útil. Processe numa forma consistente · decisões, compromissos, fatos aprendidos, threads em aberto · e arquive por cliente, porque um corpus pesquisável de toda conversa com cliente é a matéria-prima de metade da árvore de Operations. A armadilha é armazenar transcrições cruas e dar por feito: uma transcrição não estruturada é um palheiro, e ninguém consulta palheiros.",
    "ladderManual": "Alguém reescuta a gravação para achar aquela uma coisa que o cliente disse. Nunca reescuta.",
    "ladderAssisted": "Toda transcrição processada em estrutura · decisões, action items, fatos-chave, perguntas em aberto · e arquivada contra o cliente certo.",
    "ladderAutonomous": "As transcrições fluem do notetaker para um contexto estruturado e pesquisável automaticamente; todo outro agente neste mapa lê a partir do resultado."
  },
  "SOP Generation": {
    "replaces": "A expertise que sai pela porta com quem quer que tenha feito o trabalho. Todo projeto entregue contém um playbook repetível · e sem este nó, você o reconstrói do zero na próxima vez, a custo cheio, para sempre.",
    "notes": "Escreva SOPs a partir de evidência, não de memória · os arquivos de contexto e as transcrições registram o que de fato aconteceu, incluindo os modos de falha que um humano esqueceria de mencionar. A segunda entrega de qualquer tipo de serviço é o momento de extrair o playbook: uma vez é um evento, duas vezes é um padrão. A armadilha é escrever SOPs aspiracionais descrevendo como o trabalho deveria acontecer em vez de como ele comprovadamente aconteceu · esses são ignorados por todo mundo, incluindo o próprio autor.",
    "ladderManual": "O processo vive na cabeça de quem quer que o tenha feito por último. Documentação é uma coisa que você vai fazer quando as coisas acalmarem.",
    "ladderAssisted": "Depois que um projeto é entregue, o agente rascunha o playbook a partir do trabalho real · arquivos de contexto, transcrições, o que foi construído · e um humano o edita até a versão canônica.",
    "ladderAutonomous": "Padrões de trabalho repetidos são sinalizados e rascunhados em SOPs automaticamente; a biblioteca de playbooks cresce como subproduto do delivery."
  },
  "Handoff Docs": {
    "replaces": "A cauda de suporte pós-handoff: todo sistema não documentado gera meses de “perguntinhas rápidas” que são na real trabalho de retainer não pago. Handoffs ruins também limitam silenciosamente suas indicações · ninguém recomenda um sistema que não consegue operar.",
    "notes": "Escreva para a pessoa que vai de fato operar o sistema · normalmente um dono não técnico do lado do cliente, não um desenvolvedor. Três camadas dão conta: o que isso é, como usar no dia a dia, e o que fazer quando algo parece errado. Gere a partir do build real, não da proposta · o escopo derivou, e docs descrevendo o sistema que você planejou em vez do que você entregou são piores que nada. A armadilha é tratar isso como a última tarefa: docs escritas na hora final antes do handoff são as que geram a cauda de suporte.",
    "ladderManual": "O cliente recebe um Loom gravado em uma tomada e a promessa de “me dá um toque se algo quebrar”.",
    "ladderAssisted": "Documentação rascunhada a partir do próprio build · o que ele faz, como operá-lo, o que fazer quando ele se comporta mal · e o builder revisa a acurácia antes da entrega.",
    "ladderAutonomous": "As docs geram e atualizam junto com o build; no dia da entrega o handoff pack já existe e bate com o que foi de fato entregue."
  },
  "Tech-Stack Detection": {
    "replaces": "Dar o pitch de uma integração para uma empresa que não consegue rodá-la · ou perder a conta cujo stack está gritando pelo que você vende. Checar stack manualmente são 15–20 minutos por empresa entre ferramentas de detecção, vagas de emprego e código-fonte da página, então isso acontece para quase nenhuma delas.",
    "notes": "A lacuna é o produto · “eles rodam X sem Y” é um ângulo de campanha, não trivia. Cruze ferramentas de detecção com vagas de emprego e case studies; empresas anunciam seu stack toda vez que contratam para ele. Alimenta o Account Enrichment em Sales diretamente: o enrichment é a passada em massa, este é a lente técnica sobre ela.",
    "ladderManual": "View-source na homepage deles e um chute.",
    "ladderAssisted": "Stack detectado por alvo · ferramentas, plataformas, migrações recentes · com as lacunas mapeadas contra o que você vende.",
    "ladderAutonomous": "Toda conta na lista de alvos carrega um perfil de stack ao vivo; uma mudança de stack que casa com seu wedge dispara um alerta para o pipeline."
  },
  "Network Mapping": {
    "replaces": "Cold outreach para contas onde um caminho quente já existia. Uma intro quente converte a múltiplos do cold · e a maioria dos founders não sabe nomear seu alcance de segundo grau em qualquer alvo dado.",
    "notes": "Seus próprios dados são o grafo · contatos de CRM, participantes de reunião, threads de email · muito antes de qualquer ferramenta externa. Crie a convenção de registrar quem-conhece-quem na knowledge base e o mapa se acumula. Ranqueie caminhos pela recência de interação real, não pela contagem de conexões: um café no mês passado bate uma conexão de 2019.",
    "ladderManual": "Rolando as conexões em comum e torcendo para um nome soar familiar.",
    "ladderAssisted": "Caminhos até uma conta-alvo mapeados a partir do seu CRM, histórico de calls e grafos públicos · ranqueados por força, com um pedido de intro rascunhado por caminho.",
    "ladderAutonomous": "Toda nova conta-alvo chega com seu mapa de caminho-quente anexado; os dados de relacionamento se atualizam conforme calls e emails se acumulam.",
    "human": "O mapa é da IA; o pedido é seu. Gastar capital de relacionamento · a quem pedir, para quê, quando · é um julgamento que nenhum agente deveria exercer, porque o custo de um pedido desajeitado cai sobre um relacionamento humano."
  },
  "Vertical Analysis": {
    "replaces": "Entrar num vertical com base em uma boa anedota · e então descobrir seis meses depois que os orçamentos nunca estiveram lá. Um assessment de mercado adequado sai por $5–15k numa empresa de pesquisa, então a maioria das firmas pula isso e paga em trimestres desperdiçados no lugar.",
    "notes": "Pontue verticais por frequência de dor, autoridade de orçamento e alcançabilidade · não por tamanho de mercado. Um vertical pequeno que compra rápido bate um gigante que delibera. O output deveria terminar numa decisão e numa jogada de entrada, não num resumo de panorama; se o veredito for seguir, ele alimenta o ICP Definition em Sales como o próximo nó.",
    "ladderManual": "Um cliente no vertical deu certo, então o vertical deve ser bom.",
    "ladderAssisted": "Sinais de demanda, realidade de orçamento, comportamento de compra e densidade competitiva compilados num go/no-go pontuado por vertical.",
    "ladderAutonomous": "Uma watchlist de verticais candidatos se repontua num cronograma; um vertical que cruza o limiar emerge com o ângulo de entrada anexado."
  },
  "Pricing Research": {
    "replaces": "Precificar por imitação ou por coragem. A maioria das firmas define preços uma vez, a partir de duas páginas de concorrente e um feeling, e deixa 20–40% de margem na mesa por anos.",
    "notes": "Padrões de empacotamento importam mais que pontos de preço · como o mercado estrutura tiers, retainers e âncoras te diz como os compradores esperam comprar. Minere também suas próprias notas de closed-won e closed-lost: contra o que os prospects te compararam é dado de precificação que nenhum externo consegue te vender. A armadilha é tirar média · precifique contra o segmento que você quer, não o mercado inteiro.",
    "ladderManual": "Você checou o que um concorrente cobra e foi um pouco abaixo.",
    "ladderAssisted": "Taxas de mercado, pontos de ancoragem e padrões de empacotamento compilados por oferta · o que o mercado cobra, como ele agrupa, onde o teto de fato fica.",
    "ladderAutonomous": "Concorrentes monitorados e fontes de mercado são varridos de novo num cronograma; movimentos de preço e mudanças de empacotamento emergem antes da sua próxima proposta sair."
  },
  "Adversarial Verification": {
    "replaces": "O número errado dito com confiança que chega até a proposta, o deck ou o deal. Um claim ruim repetido a um cliente custa mais credibilidade do que cem verificados conquistam.",
    "notes": "Rode como uma passada separada com uma instrução separada · “ache por que isto está errado” · nunca como um autoteste feito pelo agente que escreveu o claim; o autor defendendo o próprio trabalho é como os erros sobrevivem. Classifique os claims, não só os sinalize: verificado, plausível, contestado, errado. A armadilha é verificar tudo · faça o gate só do que é estrutural, ou o pipeline desacelera até a velocidade da paranoia.",
    "ladderManual": "Soou certo e a fonte parecia legítima.",
    "ladderAssisted": "Todo claim estrutural é atacado antes de sair · contra-evidência caçada, fontes checadas quanto à independência, confiança classificada por claim.",
    "ladderAutonomous": "A verificação roda como um gate no pipeline de pesquisa: nada publica na knowledge base acima de uma confiança declarada sem sobreviver à passada de ataque.",
    "human": "Um humano é dono do que sai sob o nome da empresa. A verificação reduz o risco; ela nunca transfere a responsabilidade."
  },
  "Ticket Triage": {
    "replaces": "A primeira hora de todo turno de suporte · um rep lendo, rotulando e encaminhando antes de alguém ser atendido. Tickets roteados errado quicam entre donos 2–3 vezes e adicionam um dia por quicada.",
    "notes": "A triagem é a porta de entrada de toda a árvore de Support · tanto Escalations quanto FAQ & Self-Serve leem suas tags, então acerte as categorias antes de automatizar o roteamento. Comece com 5–7 categorias dos seus últimos 200 tickets, não 30 inventadas. A armadilha: otimizar a velocidade de roteamento enquanto os rótulos estão errados · tags ruins em alta velocidade só roteiam errado mais rápido.",
    "ladderManual": "Uma inbox compartilhada, mais antigo não lido primeiro, urgência opcional.",
    "ladderAssisted": "Todo request auto-tagueado · tópico, urgência, sentimento, dono · no momento em que chega; um humano confirma o roteamento nos cabeludos.",
    "ladderAutonomous": "Tickets se roteiam para a fila certa com contexto anexado; a prioridade se reordena ao vivo conforme o sentimento e os relógios de SLA mudam."
  },
  "Escalations": {
    "replaces": "O churn que você descobre numa avaliação de uma estrela. Quando um cliente frustrado pede um gerente, ele normalmente já vinha fervendo ao longo de três tickets educados que ninguém conectou.",
    "notes": "Calibre para falsos positivos em vez de falsos negativos · uma olhada humana desnecessária custa dois minutos, uma escalação perdida custa a conta. A camada de detecção deveria ler entre tickets, não dentro deles: três mensagens levemente irritadas em duas semanas é um sinal mais alto do que uma exaltada. Ligue as contas sinalizadas ao Health Scoring para que o risco apareça na conta, não só no ticket.",
    "ladderManual": "Um rep encaminha o email assustador com “consegue dar uma olhada nisso?”",
    "ladderAssisted": "Picos de sentimento, sinais de churn e padrões de contato repetido sinalizam em tempo real; um humano é pingado com o histórico completo da thread e uma primeira jogada sugerida.",
    "ladderAutonomous": "A detecção roda em todo canal; contas sinalizadas acionam o dono certo em minutos, com briefing · e o sistema rastreia se o resgate funcionou.",
    "human": "Um cliente irritado nunca recebe um bot. O trabalho inteiro do sistema é detecção e velocidade · a conversa que se segue é de um humano, com o contexto completo na mão."
  },
  "Onboarding Journeys": {
    "replaces": "2–4 horas de CSM por nova conta enviando a mesma sequência de boas-vindas na mão · ou a versão silenciosa, onde clientes que travam na primeira semana viram a estatística de churn do terceiro mês.",
    "notes": "Defina a ativação primeiro · a única ação que prevê retenção · e construa a jornada de trás para frente a partir dela. Instrumente cada passo para você ver exatamente onde os clientes travam; esse gráfico de drop-off é o seu roadmap de produto. A armadilha: uma linda sequência de 12 emails que ninguém mediu. Cinco passos com dados de conclusão batem doze no feeling.",
    "ladderManual": "Um email de boas-vindas, um PDF e a esperança de que eles se virem.",
    "ladderAssisted": "Sequências de ativação passo a passo rascunhadas por segmento de cliente; nudges disparam em milestones travados, o humano envia a nota de resgate.",
    "ladderAutonomous": "Todo novo cliente percorre uma jornada que se adapta ao progresso dele · travado no passo dois recebe ajuda para o passo dois, não um check-in genérico. Taxas de conclusão rastreadas por passo."
  },
  "Renewals & Expansion": {
    "replaces": "Renovações descobertas com duas semanas de antecedência e tratadas no desespero, mais a receita de expansão que ninguém chegou a pedir porque ninguém percebeu que a conta já tinha crescido além do plano.",
    "notes": "A regra dos 90 dias é o jogo inteiro: uma conversa de renovação começada cedo é uma sessão de planejamento, começada tarde vira negociação. Os sinais de expansão vivem nos dados de uso · assentos no limite, limites batidos, novos times aparecendo · então conecte isso ao que quer que o Health Scoring leia. A armadilha: abrir a call de renovação pelo preço. Abra pelo balanço de valor · o que eles ganharam neste ano · e deixe o número vir depois.",
    "ladderManual": "Um lembrete no calendário marcado na assinatura, se alguém lembrou.",
    "ladderAssisted": "Renovações aparecem com 90 dias de antecedência com contexto de saúde e uma abertura já rascunhada; padrões de uso sinalizam contas prontas para a conversa de expansão.",
    "ladderAutonomous": "Cada conta carrega uma pista de renovação e um sinal de prontidão para expansão; o responsável recebe a jogada, o timing e os pontos de conversa · e decide se vai executar.",
    "human": "Conversas de renovação e upsell são humanas, ponto final. A IA decide quando e municia quem fala · timing, histórico da conta, o ângulo de expansão. O pedido em si nunca se automatiza."
  },
  "QBR Prep": {
    "replaces": "3–5 horas de CSM por conta por trimestre montando slides a partir de dados espalhados · que é por isso que a maioria dos QBRs ou é pulada ou improvisada de memória no estacionamento.",
    "notes": "Um QBR é um argumento de renovação entregue cedo · cada slide deve responder “por que continuar pagando pra gente.” Quantifique resultados nas unidades do cliente (horas economizadas, tickets desviados, receita influenciada), não no uso das suas features. A armadilha: um despejo de dados sem ponto de vista. O slide de recomendações é o entregável; tudo antes dele é evidência.",
    "ladderManual": "O deck do trimestre passado, datas novas, os mesmos screenshots.",
    "ladderAssisted": "Dados da conta, tendências de uso, histórico de suporte e itens em aberto compilados no template de QBR da casa; o CSM edita a narrativa e os pedidos.",
    "ladderAutonomous": "Os decks se geram automaticamente no calendário trimestral · vitórias quantificadas, riscos sinalizados, recomendações para o próximo trimestre rascunhadas · prontos para um passe de polimento humano."
  },
  "Engagement & Replies": {
    "replaces": "As horas centrais de um community manager · ou a morte lenta em que as perguntas dos membros ficam sem resposta por dois dias e o espaço silenciosamente vira um mural de avisos.",
    "notes": "A velocidade de resposta é o batimento cardíaco de uma comunidade · uma pergunta respondida em 30 minutos ensina os membros a perguntar mais, uma respondida em três dias os ensina a parar. O arquivo de voz é o pré-requisito: uma resposta fora de tom numa comunidade é pior que o silêncio, porque os membros percebem. A armadilha: deixar o agente responder tudo · o founder aparecendo pessoalmente nas threads que importam é o produto.",
    "ladderManual": "O founder responde em rajadas à meia-noite, depois fica em silêncio por uma semana.",
    "ladderAssisted": "Cada pergunta e menção recebe uma resposta rascunhada na voz da casa dentro de uma hora; um humano aprova e publica.",
    "ladderAutonomous": "Perguntas de rotina respondidas direto da base de conhecimento; threads novas ou sensíveis são roteadas para um humano com um rascunho anexado. Tempo de resposta acompanhado como um SLA."
  },
  "Moderation": {
    "replaces": "O founder deletando spam de cripto às 7h da manhã, e o custo mais lento: um único mau ator sem controle ou uma thread de linchamento pode esvaziar uma comunidade mais rápido do que qualquer feature consegue enchê-la.",
    "notes": "Escreva as regras antes de construir o fiscal · moderação sem um código de conduta publicado soa arbitrária, e o arbitrário mata a confiança mais rápido que o spam. Escalone a resposta: remoção silenciosa para bots, recado privado para quem cruza a linha pela primeira vez, conversa humana para membros. A armadilha: moderar demais cedo. Uma comunidade quieta precisa de fricção removida, não adicionada.",
    "ladderManual": "Alguém nota o spam depois que doze membros já notaram.",
    "ladderAssisted": "Spam, autopromoção e alertas de conduta capturados na hora da postagem e enfileirados com contexto; um humano aprova remoções e avisos.",
    "ladderAutonomous": "Spam óbvio removido silenciosamente à primeira vista; casos de conduta na zona cinzenta caem numa fila de revisão com o histórico do membro anexado e uma ação recomendada.",
    "human": "Remoção de spam automatiza limpo. Decisões de conduta não · avisar ou remover um membro real é um julgamento que um humano faz, com as provas que o sistema reuniu."
  },
  "Member Spotlights": {
    "replaces": "O motor de retenção que ninguém opera porque não é trabalho de ninguém: as vitórias dos membros passam rolando sem serem notadas, e as pessoas com maior probabilidade de renovar nunca ouvem que importam.",
    "notes": "Um membro destacado renova, posta mais e recruta · é a jogada de retenção mais barata da árvore. Peça permissão antes de celebrar alguém publicamente; um destaque-surpresa numa vitória privada queima a confiança. A armadilha: destacar só as baleias. Celebrar uma pequena vitória de um membro quieto move a sala inteira; celebrar os mesmos três power users é só um placar de líderes.",
    "ladderManual": "Um shout-out quando o founder por acaso vê algo bom.",
    "ladderAssisted": "Vitórias, marcos e posts de destaque trazidos à tona semanalmente a partir da atividade da comunidade; rascunhos de destaque prontos na voz da casa para um humano personalizar e publicar.",
    "ladderAutonomous": "Uma cadência permanente de destaques se opera sozinha · candidatos ranqueados pela força da história, rascunhos enfileirados, publicados no cronograma com uma olhada humana."
  },
  "Payment Tracking": {
    "replaces": "A sessão semanal de arqueologia no app do banco · logando em três contas em duas moedas para reconstruir quem pagou. Mais a fatura que você esqueceu que estava em aberto até o trimestre fechar.",
    "notes": "Puxe da fonte da verdade · feeds bancários ou o processador de pagamento · não da memória ou do campo de status otimista da ferramenta de faturas. Normalize múltiplas moedas para uma única moeda de reporte com uma convenção de câmbio consistente, ou cada número lá na frente vai brigar consigo mesmo. A armadilha: acompanhar o que você enviou em vez do que caiu. Uma fatura é uma esperança; um depósito é um fato.",
    "ladderManual": "Você checa o banco quando tem um mau pressentimento.",
    "ladderAssisted": "Cada fatura acompanhada contra os pagamentos que entram · paga, a vencer, atrasada · numa única visão, atualizada diariamente, moedas normalizadas.",
    "ladderAutonomous": "Pagamentos se reconciliam contra faturas automaticamente; os atrasados se entregam sozinhos para a Collections, e a posição de caixa está sempre atualizada sem ninguém pedir."
  },
  "Revenue Reporting": {
    "replaces": "Ou $200–500/mês de tempo de contador montando um relatório que chega três semanas defasado, ou o founder reconstruindo a mesma planilha todo mês e confiando nela menos a cada vez.",
    "notes": "Um número por pergunta: o que entrou, de quem, por qual entidade, recorrente ou não. Separe receita recorrente da receita de projeto desde o dia um · é a separação com que toda decisão futura (e todo comprador) se importa. A armadilha é reportar receita faturada como receita recebida; construa apenas sobre pagamentos reconciliados ou o relatório é ficção com formatação.",
    "ladderManual": "Uma planilha com uma aba por mês e uma fórmula que alguém quebrou em março.",
    "ladderAssisted": "Receita mensal compilada entre entidades e moedas · por cliente, por tipo, recorrente vs. avulsa · rascunhada para uma conferência de sanidade humana.",
    "ladderAutonomous": "O relatório se gera sozinho no primeiro dia do mês a partir dos dados de pagamento reconciliados; anomalias são sinalizadas, não enterradas."
  },
  "CRM Sync": {
    "replaces": "A lacuna entre o que o CRM diz e o que é de fato verdade · que silenciosamente invalida todo relatório, forecast e jogada de reativação construídos em cima disso.",
    "notes": "Escolha um único sistema de registro por objeto · os deals vivem aqui, o dinheiro vive ali · e faça todo o resto ser um espelho, nunca um segundo autor. Sincronize a partir da atividade (transcrições, pagamentos, emails enviados), não a partir da disciplina humana, porque a disciplina humana foi justamente o que falhou de início. A armadilha: sync de mão dupla entre dois sistemas que ambos acham que são o chefe.",
    "ladderManual": "O CRM é atualizado numa leva de culpa antes de alguém ir olhar.",
    "ladderAssisted": "Deals, contatos e status sincronizam entre os sistemas · CRM, faturamento, gestor de projetos · com mudanças rascunhadas a partir da atividade real para aprovação.",
    "ladderAutonomous": "Calls, emails e pagamentos atualizam os registros conforme acontecem; todo sistema concorda, e ninguém digita o mesmo nome de cliente duas vezes.",
    "human": "Fusões e exclusões recebem um clique humano. Um sync ruim que cria uma duplicata é irritante; um que destrói um registro é arqueologia."
  },
  "Expense Categorization": {
    "replaces": "$150–400/mês de categorização de contador, ou a semana anual da caixa de sapatos em que o founder revive doze meses de recibos para responder à planilha do contador.",
    "notes": "Pegue o plano de contas com o seu contador primeiro e categorize dentro dele · inventar suas próprias categorias só cria um trabalho de tradução mais tarde. Aceite automaticamente os 80% recorrentes (mesmo fornecedor, mesma categoria, todo mês) e só traga à tona o novo e o ambíguo. A armadilha é gasto multi-entidade num único cartão: codifique de uma vez qual entidade é dona de qual assinatura, ou todo mês vaza custos mal atribuídos.",
    "ladderManual": "Uma pasta chamada “recibos” e uma crença firme de que o você-do-futuro vai lidar com isso.",
    "ladderAssisted": "Transações puxadas dos feeds e auto-categorizadas no seu plano de contas, com a cauda incerta enfileirada para uma revisão semanal de 10 minutos.",
    "ladderAutonomous": "O gasto chega pré-categorizado por entidade com recibos anexados; o contador recebe um arquivo limpo, não um questionário.",
    "human": "Tratamento tributário é julgamento, não classificação · decisões de dedutibilidade e qualquer coisa que faria o contador levantar a sobrancelha ficam humanas."
  },
  "Entity Compliance": {
    "replaces": "Declarações perdidas, e o que elas custam: multas por atraso, uma entidade suspensa, ou uma conta bancária congelada descoberta justo na semana em que você precisa dela. Founders com múltiplas entidades carregam uma lista de prazos que ninguém de fato mantém.",
    "notes": "Construa o registro de obrigações por entidade primeiro · jurisdição, declaração, frequência, prazo, quem protocola · direto do seu contador e do seu agente registrado, não da memória. Alertas em 30, 14 e 3 dias, com o maior prazo de antecedência em qualquer coisa que exija um terceiro. A armadilha: acompanhar só o imposto. Licenças comerciais, agentes registrados, renovações de visto e exigências de substância matam entidades com a mesma facilidade.",
    "ladderManual": "O contador te manda um email urgente e você descobre que um prazo existia.",
    "ladderAssisted": "As obrigações de cada entidade · declarações, renovações, datas fiscais, prazos de licença · acompanhadas em um único calendário com alertas de antecedência e checklists preparados.",
    "ladderAutonomous": "O sistema vigia as obrigações, rascunha a papelada de rotina e escala com tudo montado; humanos assinam e protocolam.",
    "human": "Declarações são assinadas por um humano, ponto final. A IA acompanha, prepara e cobra · ela nunca protocola nada com peso legal por conta própria."
  },
  "Calendar Management": {
    "replaces": "A função central de um EA meio-período ($15–25k/ano), ou o founder fazendo conta de fuso horário à meia-noite e o agendamento duplo que incendeia uma primeira impressão.",
    "notes": "Escreva as regras antes da automação: horários de reunião, tamanho dos buffers, quais tipos de reunião merecem quais slots, o que é sagrado. O agente aplica a política · se não há política, ele só automatiza o caos mais rápido. A armadilha é otimizar para abertura: um calendário que aceita tudo com eficiência é um calendário que destrói o trabalho profundo com eficiência.",
    "ladderManual": "Você é o elo de agendamento, e o elo está cansado.",
    "ladderAssisted": "Conflitos capturados, buffers respeitados, fusos horários resolvidos; pedidos de reagendamento voltam com opções sensatas em vez de um dar de ombros.",
    "ladderAutonomous": "O calendário se defende sozinho · blocos de foco protegidos, tempo de deslocamento e de preparação adicionados automaticamente, pedidos de baixa prioridade desviados para o slot certo sem um humano no loop."
  },
  "Email Triage": {
    "replaces": "As 1–2 horas por dia que um founder passa na caixa de entrada, das quais talvez quinze minutos são decisões e o resto é ordenar as prioridades dos outros.",
    "notes": "O classificador precisa do seu contexto para saber o que importa · um nome de cliente, um deal aberto, uma fatura vencida, tudo isso muda a prioridade de um email, e é por isso que ele lê da base de conhecimento. Comece só com triagem por duas semanas e audite as decisões antes de deixá-lo rascunhar. A armadilha é filtrar demais: um email importante no purgatório do spam custa mais confiança do que cem newsletters corretamente arquivadas rendem.",
    "ladderManual": "Caixa de entrada aberta o dia todo, atenção alugada uma notificação de cada vez.",
    "ladderAssisted": "Cada email ordenado na chegada · precisa-de-você / FYI / ruído automatizado · com respostas rascunhadas enfileiradas nos de rotina.",
    "ladderAutonomous": "A caixa de entrada vira um briefing: o punhado que genuinamente precisa de um humano, trazido à tona com contexto e um rascunho; o resto catalogado, respondido ou arquivado por regras permanentes.",
    "human": "A triagem é autônoma; o envio não. As respostas saem depois que um humano aprova · e o agente nunca deleta, só arquiva, então um email mal julgado está a uma busca de distância, não perdido."
  },
  "Candidate Sourcing": {
    "replaces": "A taxa de colocação de 20–25% de um recrutador, ou 10+ horas de founder por vaga rolando perfis · que é por isso que a maioria das pequenas empresas contrata de quem por acaso se candidatou.",
    "notes": "O scorecard é a construção inteira: resultados que a vaga precisa entregar, evidências obrigatórias, desqualificadores · escritos antes da primeira busca, guardados onde os agentes leem. Ranqueie por trabalho demonstrado acima da densidade de palavras-chave; títulos mentem, portfólios não. A armadilha é fazer sourcing pelo currículo que você reconheceria em vez do resultado que você precisa · o scorecard existe para impedir isso.",
    "ladderManual": "Publique a vaga, reze, contrate o candidato menos ruim na sexta semana.",
    "ladderAssisted": "Um scorecard de vaga de verdade guia as buscas entre plataformas; os candidatos voltam ranqueados contra ele com razões, não com vibe.",
    "ladderAutonomous": "Vagas abertas rodam buscas permanentes; novos matches chegam pontuados e deduplicados, outreach rascunhado, pipeline sempre aquecido antes de a cadeira ficar vazia."
  },
  "Screening & Scheduling": {
    "replaces": "Os 30 minutos por candidato que uma triagem de primeira passagem realmente leva, multiplicados pelos 80% que nunca iam passar · mais o ping-pong de agendamento que perde bons candidatos para empresas mais rápidas.",
    "notes": "Estruturado vence o livre: mesmas perguntas, mesma rubrica, cada candidato · é mais justo e faz a pontuação da IA ser de fato comparável. Velocidade é uma arma aqui; os melhores candidatos somem em dias, e triagem no mesmo dia mais agendamento instantâneo ganham talentos que empresas mais lentas nem chegam a conhecer. A armadilha: otimizar para o polimento na entrevista. Pontue a evidência de fazer o trabalho, não a fluência em descrevê-lo.",
    "ladderManual": "Você passa o olho em quarenta currículos num domingo e entrevista quem te irritou menos.",
    "ladderAssisted": "Cada candidato triado contra o scorecard · perguntas estruturadas feitas e pontuadas · com uma shortlist e o raciocínio para revisão humana; as entrevistas se agendam sozinhas.",
    "ladderAutonomous": "As triagens rodam na chegada, o calendário se enche só com candidatos acima da régua, e todo o resto recebe um não rápido e decente · rascunhado pelo sistema, aprovado por um humano.",
    "human": "A IA filtra; humanos rejeitam e avançam. Todo não em um candidato real é uma decisão humana · o sustento de uma pessoa merece mais do que um limiar, e a sua reputação num mercado pequeno também."
  },
  "Onboarding & Training": {
    "replaces": "O primeiro mês perdido do novo contratado · pedindo acessos por aí, absorvendo contexto por osmose · e a semana da pessoa sênior gasta reexplicando o que deveria ter sido escrito.",
    "notes": "Este nó é só tão bom quanto a base de conhecimento por trás dele · onboarding é na real só a empresa documentada de si mesma, sequenciada em 30 dias. Escreva o plano como resultados por semana (o que a pessoa consegue fazer sem supervisão) em vez de conteúdo consumido. A armadilha é o onboarding de despejo de informação: quarenta documentos na primeira semana não ensinam nada; uma tarefa real com o playbook relevante anexado ensina tudo.",
    "ladderManual": "O primeiro dia é um laptop, um convite pro Slack e “fica de sombra da Sarah um tempo.”",
    "ladderAssisted": "Oferta aceita → checklist de acessos, playbooks, tutoriais de ferramentas e um plano de 30 dias gerado a partir do scorecard da vaga; um humano designa o mentor e a primeira tarefa real.",
    "ladderAutonomous": "O arco inteiro se opera sozinho · contas provisionadas, treinamento sequenciado, check-ins agendados, progresso acompanhado · e o gestor recebe um alerta só quando alguém está fora do ritmo."
  },
  "Lookalike Modeling": {
    "replaces": "A lista de expansão que ninguém constrói metodicamente · a maioria dos times chuta \"quem mais se parece com os nossos melhores clientes\" em vez de extrair o padrão de verdade.",
    "notes": "Isso é a ICP Definition apontada ao contrário · em vez de quem você acha que quer, ela lê quem de fato comprou e acha mais gente igual. A qualidade depende inteiramente de ter dados de closed-won limpos, então ela fica a jusante da Win/Loss Analysis.",
    "ladderManual": "Alguém bate o olho na lista de closed-won e diz \"vamos mirar em mais empresas como essas.\"",
    "ladderAssisted": "O agente extrai as firmografias compartilhadas reais + os gatilhos do closed-won, constrói uma query de lookalike e devolve uma nova lista ranqueada.",
    "ladderAutonomous": "Cada fechamento alimenta o modelo · a lista de lookalike se atualiza sozinha e flui direto para o sourcing."
  },
  "Cold-Call Scripting": {
    "replaces": "Os reps que travam na call porque ninguém escreveu as ramificações · ou o \"script\" que é um parágrafo e morre na primeira objeção.",
    "notes": "A skill dedicada escreve scripts de call + de voicemail que soam humanos, com ramificações para \"não tenho interesse\", \"me manda um email\", \"já temos alguém\", \"sem orçamento\". Dê a ela a oferta e uma objeção real e ela aperta rápido.",
    "ladderManual": "Um rep improvisa, ou lê um script engessado que o prospect consegue ouvir que é um script.",
    "ladderAssisted": "O agente escreve a abertura, o pattern interrupt, a linha de valor e uma árvore completa de ramificações de objeção com exemplos de frase para cada uma.",
    "ladderAutonomous": "Os scripts se regeneram por segmento conforme os dados de objeção voltam das calls reais.",
    "human": "Um humano entrega · isso rascunha as palavras, o rep as faz soar como uma pessoa. As ramificações de objeção são o valor, não a abertura."
  },
  "Video Prospecting": {
    "replaces": "10+ minutos por vídeo personalizado feito direito · que é por isso que os reps gravam três e desistem.",
    "notes": "Vídeo funciona porque quase ninguém faz bem, e morre porque quase ninguém escreve o roteiro. A skill dedicada roteiriza o hook + linha pessoal + valor + CTA a partir do dossiê do prospect · o humano só aperta o gravar.",
    "ladderManual": "Um rep encara a luz de gravação do Loom sem roteiro e enrola por dois minutos.",
    "ladderAssisted": "O agente escreve um roteiro de menos de 90 segundos · hook na tela, uma primeira linha sobre o mundo real do prospect, um beat de valor, um CTA.",
    "ladderAutonomous": "Cada lead numa sequência carrega um roteiro de vídeo personalizado gerado a partir do seu dossiê."
  },
  "Referral Capture": {
    "replaces": "As apresentações quentes que evaporam · um prospect diz \"fala com o meu colega de ops\" e a resposta fica sem ação por uma semana até o momento passar.",
    "notes": "Indicações fecham mais ou menos duas vezes mais rápido que o cold · e são a parte mais furada da maioria dos pipelines porque chegam como uma frase jogada numa resposta. Isso as captura no instante em que caem.",
    "ladderManual": "Um rep lê a resposta, pretende fazer o follow-up da indicação, esquece.",
    "ladderAssisted": "O agente sinaliza cada resposta do tipo \"fala com / inclui / não sou eu, mas\", rascunha o pedido de apresentação quente e roteia o novo contato para o pipeline.",
    "ladderAutonomous": "Respostas de indicação são detectadas, a apresentação é rascunhada, e o novo lead é criado e atribuído sem um humano tocar na caixa de entrada."
  },
  "Objection Library": {
    "replaces": "O conhecimento de contorno de objeções que vive só na cabeça do seu melhor closer · e sai pela porta quando ele sai.",
    "notes": "Isso transforma as gravações das suas calls num ativo que compõe. Ele lê quais objeções realmente apareceram e quais respostas precederam um deal ganho · então as réplicas são baseadas em evidência, não inventadas. Alimenta direto a Cold-Call Scripting e a Objection Response.",
    "ladderManual": "Cada rep reaprende as mesmas objeções do zero, mal.",
    "ladderAssisted": "O agente garimpa cada call gravada em busca de objeções, agrupa-as e rascunha a réplica que de fato empurrou os deals para frente.",
    "ladderAutonomous": "A biblioteca se atualiza sozinha conforme novas calls chegam · novas objeções surgem, réplicas fracas são sinalizadas e reescritas."
  },
  "Thumbnail & Cover Design": {
    "replaces": "O clique que você perde antes de alguém ler uma palavra · a maioria do conteúdo morre num thumbnail fraco, não num conteúdo fraco.",
    "notes": "O thumbnail é o anúncio do conteúdo. A skill dedicada produz capas que param o scroll, dentro da marca, e testa variantes · combine-a com a Performance Mining para que os vencedores ensinem o próximo lote.",
    "ladderManual": "Você joga um frame do vídeo em cima e reza.",
    "ladderAssisted": "O agente gera variantes de thumbnail e de capa afinadas ao hook, dentro da marca, prontas para A/B.",
    "ladderAutonomous": "As capas se geram por post a partir do hook, com os padrões vencedores realimentados dos dados de performance."
  },
  "Ad Creative": {
    "replaces": "O gargalo de criativo em toda conta paga · um anúncio, sem variações, fatigando enquanto você dorme.",
    "notes": "Aquisição paga se ganha no volume de criativo, não em ajustes de lance. A skill dedicada transforma anúncios vencedores em novos ângulos e formatos · o mesmo motor por trás dos alertas de fadiga de criativo do dashboard de Meta Ads.",
    "ladderManual": "Um designer faz um anúncio por semana; nada é testado.",
    "ladderAssisted": "O agente gera variações de hook, ângulo e formato a partir dos seus vencedores · prontas para lançar como um lote de teste.",
    "ladderAutonomous": "Criativo novo é gerado e enfileirado continuamente, rotacionando antes de a fadiga se instalar, aprendendo com o gasto."
  },
  "Landing Page Copy": {
    "replaces": "Um copywriter de $2–5k por página, ou pior · o founder escrevendo listas de features que ninguém converte.",
    "notes": "Copy de conversão é uma estrutura, não um talento · hook, problema nas palavras deles, mecanismo, prova, oferta com reversão de risco, FAQ de objeções, um CTA. A skill dedicada escreve a página inteira, seção por seção, a partir da sua oferta e do seu ICP.",
    "ladderManual": "Você escreve a página você mesmo, abre pelas features, e se pergunta por que ela não converte.",
    "ladderAssisted": "O agente escreve a página inteira na ordem comprovada · promessa do hero, problema, mecanismo, prova, oferta, FAQ, CTA · na sua voz.",
    "ladderAutonomous": "As páginas se geram por oferta e por campanha, com variantes escritas para teste."
  },
  "Data Migration": {
    "replaces": "O projeto de migração que é orçado em $5–20k e ainda assim perde linhas · ou o estagiário copiando registros à mão entre dois CRMs por quinze dias.",
    "notes": "Migrações falham em silêncio · mil linhas entram, novecentas saem, e ninguém percebe até um cliente perceber. A skill dedicada mapeia, transforma e reconcilia com validação de contagem de linhas, para que \"perdemos alguma coisa?\" seja uma pergunta respondível, não uma esperança.",
    "ladderManual": "Alguém exporta um CSV, mapeia as colunas à mão, reimporta e reza para nada ter quebrado.",
    "ladderAssisted": "O agente mapeia os campos, transforma, deduplica, valida a contagem de linhas nos dois lados e reporta exatamente o que moveu e o que não moveu.",
    "ladderAutonomous": "Syncs contínuos rodam em uma agenda programada com checagens de reconciliação · o drift é sinalizado antes de se acumular."
  },
  "Agent Evaluation": {
    "replaces": "A confiança cega de que um agente ainda funciona depois que você mudou o prompt dele · até um cliente pegar a regressão no seu lugar.",
    "notes": "No momento em que você tem agentes fazendo trabalho de verdade, \"ainda está bom depois da minha mudança?\" vira A pergunta. Isto constrói o harness de avaliação · um conjunto de benchmark, uma rubrica de pontuação e um gate de regressão · para que qualidade seja medida, não presumida.",
    "ladderManual": "Você dá uma olhada em um ou dois outputs depois de uma mudança e considera testado.",
    "ladderAssisted": "O agente roda os novos outputs contra um conjunto de benchmark e uma rubrica, pontua cada um e sinaliza regressões antes que elas entrem em produção.",
    "ladderAutonomous": "Toda mudança de prompt ou de modelo dispara uma rodada de avaliação · nada chega à produção sem passar no corte."
  },
  "Monitoring & Alerting": {
    "replaces": "Descobrir que uma automação morreu há três dias porque um cliente perguntou cadê o relatório dele.",
    "notes": "Falha silenciosa é o imposto de rodar qualquer coisa em produção. A skill dedicada vigia seus crons, jobs e agentes e te avisa antes do cliente · o primeiro trabalho da função de Confiabilidade.",
    "ladderManual": "Você percebe que algo quebrou quando o output para de aparecer.",
    "ladderAssisted": "O agente vigia cada automação em busca de execuções falhas e travamentos silenciosos, e alerta no momento em que uma cai.",
    "ladderAutonomous": "A saúde é monitorada continuamente por toda a stack · falhas alertam com contexto e um primeiro diagnóstico já anexado."
  },
  "Cost & Usage Tracking": {
    "replaces": "A conta de API surpresa de cinco dígitos · gasto de tokens que ninguém estava acompanhando até o financeiro sinalizar.",
    "notes": "Agentes que entram em loop, tentam de novo ou rodam em dados desatualizados queimam dinheiro em silêncio. Isto acompanha o gasto contra um orçamento por fonte, para que um job descontrolado seja um alerta de terça de manhã, não um soco no estômago no fim do mês.",
    "ladderManual": "Você confere o dashboard do provedor quando a fatura te assusta.",
    "ladderAssisted": "O agente acompanha o gasto de tokens e de API contra um orçamento mensal e sinaliza a taxa de queima antes de você estourar o limite.",
    "ladderAutonomous": "O gasto é acompanhado por automação, atribuído ao trabalho e limitado · uso descontrolado dispara um alerta e um throttle."
  },
  "Incident Response": {
    "replaces": "A hora frenética de \"o que quebrou e por quê\" toda vez que uma automação cai · geralmente durante uma entrega pra cliente.",
    "notes": "Confiabilidade é um loop, não uma correria heroica · detectar, triar, achar a causa-raiz, corrigir e documentar para não acontecer duas vezes. A skill dedicada roda esse runbook para que uma queda custe minutos, não uma manhã.",
    "ladderManual": "Tudo para enquanto alguém escava os logs tentando reproduzir a falha.",
    "ladderAssisted": "O agente tria o alerta, reproduz a falha, encontra a provável causa-raiz, propõe a correção e redige a nota do incidente.",
    "ladderAutonomous": "Modos de falha conhecidos se autocorrigem · o resto escala com um diagnóstico completo e um postmortem já escrito."
  },
  "Funding & Financials Lookup": {
    "replaces": "Os 30 minutos de garimpo no Crunchbase, notícias e registros públicos para responder \"eles têm orçamento de verdade?\" · feito para cada conta, à mão.",
    "notes": "O melhor sinal isolado de \"eles podem comprar?\" é \"eles acabaram de captar grana?\". Isto puxa dados de funding, investidores e estimativas financeiras para que o outreach caia onde o orçamento realmente está. Combina com Account Monitoring para pegar a captação no dia em que acontece.",
    "ladderManual": "Alguém joga \"[empresa] funding\" no Google e chuta a receita.",
    "ladderAssisted": "O agente puxa rodadas, investidores, estimativas de receita e registros públicos recentes para uma leitura limpa do poder de compra de um alvo.",
    "ladderAutonomous": "Cada conta no pipeline carrega uma leitura financeira atual · atualizada quando algo muda."
  },
  "Buying-Committee Mapping": {
    "replaces": "Os deals que empacam porque você estava vendendo pra pessoa errada · nenhum mapa de quem de fato assina.",
    "notes": "A maioria dos deals B2B tem 5–7 pessoas envolvidas e uma delas mata o negócio silenciosamente. A skill dedicada identifica o comitê, os papéis de cada um e a preocupação que cada pessoa precisa ver respondida.",
    "ladderManual": "Você fala com um contato e torce para que ele seja o tomador de decisão.",
    "ladderAssisted": "O agente mapeia o comitê · comprador econômico, champion, bloqueadores, influenciadores · com o papel de cada pessoa e a provável preocupação.",
    "ladderAutonomous": "O mapa se constrói a partir do organograma e se atualiza conforme novos contatos entram no deal.",
    "human": "Um humano conduz o deal · isto desenha o tabuleiro para que ele saiba quem conquistar e em que ordem. Deals enterprise são perdidos mais por comitês não mapeados do que por pitches ruins."
  },
  "Warm-Path Finding": {
    "replaces": "A abordagem fria que você não precisava ter mandado · existia um caminho de intro quente e ninguém procurou.",
    "notes": "Uma intro quente converte muitas vezes melhor que uma fria e a maioria dos times nunca checa se tem uma. Isto encontra o caminho e escreve o pedido de intro · a diferença entre \"quem é você?\" e \"prazer em conversar, [contato em comum] fala muito bem de você\".",
    "ladderManual": "Você manda Cold Email pra uma conta na qual você na verdade tem duas conexões em comum.",
    "ladderAssisted": "O agente encontra o caminho real mais curto até um alvo · quem na sua rede pode fazer a intro · e redige o pedido.",
    "ladderAutonomous": "Toda conta-alvo é checada por um caminho quente antes de qualquer abordagem fria ser tentada."
  },
  "TAM / Market Sizing": {
    "replaces": "O número do deck de board tirado do nada · ou um contrato de $15k com um analista para dimensionar um mercado.",
    "notes": "Um TAM de verdade é uma contagem de empresas que se qualificam, não uma porcentagem de uma manchete da McKinsey. A skill dedicada dimensiona o prêmio de baixo para cima · quantos alvos reais existem · para você saber se um vertical vale a campanha antes de construí-la.",
    "ladderManual": "Alguém multiplica dois chutes e chama isso de TAM.",
    "ladderAssisted": "O agente conta as empresas que de fato se encaixam no ICP em um mercado, por segmento, com as premissas à mostra.",
    "ladderAutonomous": "O tamanho de mercado se recalcula conforme o ICP se afia e novos segmentos são testados."
  },
  "Account Monitoring": {
    "replaces": "Descobrir semanas atrasado que um alvo captou, contratou um VP ou trocou de ferramenta · pela newsletter dele, não pelo seu radar.",
    "notes": "Timing vence personalização. A skill dedicada vigia suas contas-alvo para que o evento-gatilho · a captação, a nova contratação, a migração · chegue até você na manhã em que acontece, enquanto a janela está aberta. O primeiro trabalho da função de Monitoramento.",
    "ladderManual": "Você repesquisa uma conta do zero toda vez que lembra que ela existe.",
    "ladderAssisted": "O agente vigia uma lista de alvos em busca de mudanças de funding, contratação, liderança e tecnologia e traz à tona o que se moveu.",
    "ladderAutonomous": "A watchlist roda continuamente · toda mudança relevante em uma conta-alvo cai como um sinal pontuado."
  },
  "News & Mention Tracking": {
    "replaces": "Uma ferramenta de monitoramento de mídia de $200/mês, mais a lacuna que ela deixa na cobertura de concorrentes e temas.",
    "notes": "Você não consegue responder ao que não consegue ver · uma avaliação ruim, o lançamento de um concorrente, a pergunta de um jornalista, todos têm pavio curto. Isto vigia a conversa para você chegar cedo, não surpreso.",
    "ladderManual": "Você descobre que foi mencionado quando alguém te manda um print.",
    "ladderAssisted": "O agente rastreia toda menção à sua marca, concorrentes e temas-chave em notícias e redes sociais assim que ela aparece.",
    "ladderAutonomous": "As menções são rastreadas, classificadas por sentimento e importância, e as que importam são roteadas."
  },
  "Alert Routing": {
    "replaces": "O monitoramento que vira ruído · 200 alertas por dia, todos ignorados em uma semana.",
    "notes": "Monitoramento sem roteamento é só uma caixa de entrada mais barulhenta. A skill dedicada pontua e roteia · a Série B de uma conta central vai para o founder com o caminho de intro anexado; o resto fica fora do caminho. É isto que torna o monitoramento utilizável em vez de exaustivo.",
    "ladderManual": "Todo sinal pinga no mesmo canal e todo mundo passa a ignorar.",
    "ladderAssisted": "O agente pontua cada sinal por relevância e urgência e roteia só o que importa para a pessoa ou canal certo.",
    "ladderAutonomous": "Os sinais se auto-triam · os de alto valor chegam ao humano certo com contexto, o resto é logado silenciosamente."
  },
  "Data Visualization": {
    "replaces": "A pesquisa que chega como um paredão de texto que ninguém lê · ou o analista que passa uma tarde inteira fazendo um único gráfico.",
    "notes": "Um achado que precisa de três parágrafos para cair é um achado que não vai cair. A skill dedicada renderiza a pesquisa no gráfico ou diagrama que torna tudo óbvio · a camada visual em cima de Research Reports.",
    "ladderManual": "Os achados são colados num doc como parágrafos e bullet points.",
    "ladderAssisted": "O agente transforma a pesquisa em gráficos e diagramas que passam a mensagem num relance.",
    "ladderAutonomous": "Todo relatório sai com o visual certo gerado automaticamente a partir dos seus dados."
  },
  "Macro Authoring": {
    "replaces": "Cada agente redigitando a mesma resposta do zero · e respondendo de um jeito ligeiramente diferente a cada vez.",
    "notes": "O jeito mais rápido de cortar o tempo de resposta é parar de escrever a mesma resposta duas vezes. Isto minera o histórico de tickets em busca do que se repete e escreve a resposta reutilizável e na voz certa · alimentando a mesma fonte que move o FAQ & Self-Serve.",
    "ladderManual": "Os atendentes de suporte improvisam as mesmas cinquenta respostas de cem jeitos diferentes.",
    "ladderAssisted": "O agente lê os tickets recorrentes e redige macros prontas e alinhadas à marca para o time reutilizar.",
    "ladderAutonomous": "As macros se geram e se atualizam sozinhas conforme novas perguntas repetidas surgem · a biblioteca se mantém atual sem um mutirão."
  },
  "Churn Prediction": {
    "replaces": "A renovação que te surpreende por não acontecer · a entrevista de saída que deveria ter sido um resgate três semanas antes.",
    "notes": "O Health Scoring te diz o estado atual; isto prevê a trajetória. Ele pega os indicadores antecedentes · o champion que ficou quieto, a cadência de login amolecendo · enquanto uma conversa ainda pode reverter.",
    "ladderManual": "Você descobre que uma conta deu Churn quando o cancelamento chega.",
    "ladderAssisted": "O agente modela quais contas têm probabilidade de escorregar · ponderando tendência de uso, sentimento e engajamento · antes da queda óbvia.",
    "ladderAutonomous": "Contas em risco são sinalizadas cedo com o motivo e uma jogada recomendada, continuamente."
  },
  "Advocacy & Referrals": {
    "replaces": "Os cases e as indicações que você nunca pede · clientes felizes que ajudariam de bom grado se alguém pegasse o momento.",
    "notes": "Seus clientes mais felizes são seu canal de crescimento mais barato e o único que ninguém trabalha de forma sistemática. Isto fica de olho no ponto mais alto · uma vitória, uma resposta elogiosa, uma renovação · e faz o pedido enquanto o sentimento está fresco.",
    "ladderManual": "Você tem a intenção de pedir uma indicação ao seu melhor cliente; você nunca pede.",
    "ladderAssisted": "O agente identifica contas no pico de felicidade e redige o pedido · indicação, avaliação ou case · no momento certo.",
    "ladderAutonomous": "A advocacia dispara a partir de picos de saúde · o pedido certo sai quando a satisfação está no auge, acompanhado até o asset final."
  },
  "Event Coordination": {
    "replaces": "A comunidade que fica quieta porque os AMAs e as calls pararam de acontecer · rodar eventos é um trabalho de meio período que ninguém assume.",
    "notes": "Uma comunidade vive de ritmo · os membros ficam pela próxima coisa no calendário. Isto roda os AMAs, calls e spotlights numa cadência confiável para que a sala sempre tenha um motivo para voltar.",
    "ladderManual": "Os eventos acontecem esporadicamente quando alguém lembra de organizar um.",
    "ladderAssisted": "O agente agenda a cadência, redige a divulgação, envia lembretes e prepara o roteiro de cada sessão.",
    "ladderAutonomous": "O calendário de eventos roda nos trilhos · agendado, divulgado, lembrado e recapitulado, com o humano só aparecendo para apresentar."
  },
  "Cash-Flow Forecasting": {
    "replaces": "A entrega principal do CFO fracionário · ou, mais comum, nenhum forecast e um founder chutando o runway.",
    "notes": "O Revenue Reporting te diz o que aconteceu; isto te diz o que vem por aí. A skill dedicada projeta o caixa que entra e sai, calcula o runway e roda cenários (\"contratar dois\", \"perder o maior cliente\", \"dobrar o gasto com ads\") para que \"a gente consegue bancar isso?\" tenha uma resposta antes de virar urgente.",
    "ladderManual": "O caixa é conferido olhando o saldo do banco e sentindo ou tranquilidade ou pavor.",
    "ladderAssisted": "O agente projeta entradas e saídas, calcula o runway e constrói uma visão futura de 3/6/12 meses com as premissas à mostra.",
    "ladderAutonomous": "O forecast se atualiza conforme o dinheiro se move · os modelos de runway e de cenário se atualizam sozinhos e sinalizam quando um limiar é cruzado.",
    "human": "Um humano é dono das premissas e das decisões que vêm depois · isto faz a conta, rápido e honestamente, e mostra a conta feita. As decisões continuam humanas."
  },
  "Budget Tracking": {
    "replaces": "O orçamento definido uma vez em janeiro e nunca mais olhado · estouros descobertos na época do imposto.",
    "notes": "Um orçamento que você não confere é um desejo. Isto vigia o gasto contra o planejado por categoria para que o estouro seja um alerta sobre o qual você age, não um número que você explica depois do fato. Combina com Cash-Flow Forecasting como a função de Finance Ops.",
    "ladderManual": "O gasto é reconciliado contra o orçamento trimestralmente, quando muito.",
    "ladderAssisted": "O agente acompanha o gasto real contra o orçamento por categoria e sinaliza os estouros conforme eles surgem.",
    "ladderAutonomous": "A variação de orçamento é monitorada continuamente · uma categoria com tendência de estouro é sinalizada no meio do mês, não depois."
  },
  "Document Filing & Retrieval": {
    "replaces": "A tarde de sexta gasta caçando \"o SOW assinado de março\" · multiplicada por todo mundo, toda semana.",
    "notes": "\"Cadê aquele documento?\" é um imposto que todo negócio paga diariamente. A skill dedicada impõe nomenclatura, arquivamento e um índice para que a recuperação seja de dez segundos, não uma força-tarefa · e aplica retenção para que registros antigos não se empilhem.",
    "ladderManual": "Os arquivos vivem em sete lugares com nomes tipo \"final_v3_FINAL\".",
    "ladderAssisted": "O agente nomeia, arquiva e indexa cada documento para que qualquer um deles seja encontrável em segundos.",
    "ladderAutonomous": "Os documentos são arquivados e taggeados na chegada, com regras de retenção aplicadas · nada nunca se perde ou fica guardado tempo demais."
  },
  "Contract Lifecycle": {
    "replaces": "A renovação automática que você esqueceu de cancelar · o contrato de cliente que caducou porque ninguém acompanhou a data.",
    "notes": "Contratos têm datas que custam dinheiro quando perdidas · um acordo de cliente que caducou, um fornecedor renovando automaticamente a uma taxa pior. Isto acompanha cada obrigação e prazo para que o calendário trabalhe a seu favor em vez de contra você.",
    "ladderManual": "As datas de renovação e expiração vivem na memória de alguém e num convite de calendário esquecido.",
    "ladderAssisted": "O agente acompanha a renovação, expiração e obrigações de cada contrato e as traz à tona bem antes do prazo.",
    "ladderAutonomous": "O ciclo de vida se conduz sozinho · renovações sinalizadas a tempo de agir, obrigações acompanhadas, nada pega você de surpresa."
  },
  "HR & Policy Assistant": {
    "replaces": "A primeira contratação de RH que um time pequeno ainda não consegue justificar · e o founder respondendo \"quantos dias de folga eu tenho?\" entre uma call de vendas e outra.",
    "notes": "A skill dedicada é ancorada estritamente nos próprios documentos de política da empresa · ela nunca chuta uma política, cita a fonte e escala as questões difíceis. Ela tira o founder do papel de help desk para \"qual é a nossa política sobre…\".",
    "ladderManual": "Perguntas sobre política interrompem quem estiver mais perto, respondidas de memória e de forma inconsistente.",
    "ladderAssisted": "O agente responde às perguntas da equipe a partir do manual de verdade · folga, despesas, processo · com uma citação, e cuida do administrativo do Onboarding.",
    "ladderAutonomous": "O people-ops rotineiro se conduz sozinho · política respondida a partir da fonte, o administrativo de novas contratações sequenciado, o manual mantido atual.",
    "human": "Qualquer coisa jurídica, sensível ou sobre remuneração/desligamento escala para um humano imediatamente · isto responde os 80% rotineiros a partir de política documentada e nunca inventa uma."
  },
  "Clientes & Processos": {
    "replaces": "A tarde de paralegal digitando número de processo, partes e prazos de petições escaneadas numa planilha que já nasce desatualizada.",
    "notes": "",
    "ladderManual": "Um advogado digita o número CNJ, as partes e cada novo movimento numa pasta-por-cliente que só ele sabe navegar.",
    "ladderAssisted": "Captura por voz e OCR leem a petição; o cadastro de cliente e processo se preenche e a timeline de movimentos se monta conforme os documentos chegam.",
    "ladderAutonomous": "Novos movimentos caem na timeline do processo no dia em que publicam, casados com o cliente certo sem ninguém abrir o arquivo.",
    "human": "O advogado confere as partes e o número CNJ na entrada — um dígito trocado acompanha o processo pra sempre."
  },
  "Editor Jurídico": {
    "replaces": "O vai-e-volta de Word e email onde a versão assinada é o anexo que alguém jura ser o final.",
    "notes": "",
    "ladderManual": "Os rascunhos moram no Word, as versões moram no email, e 'assinada_final_v3' é nome de arquivo, não status.",
    "ladderAssisted": "A peça é escrita no editor e percorre um fluxo de status de verdade — rascunho, revisão, assinado — exportando pra PDF ou DOCX quando precisa.",
    "ladderAutonomous": "O status avança sozinho conforme a peça passa na revisão; o PDF com a marca renderiza e arquiva no processo no momento em que é assinada.",
    "human": "Um advogado é dono do gate de assinatura — nada passa de rascunho pra assinado sem uma pessoa ler o texto final."
  },
  "Geração de Peças por IA": {
    "replaces": "As duas a quatro horas por peça copiando a última petição parecida e trocando os fatos — o gargalo que decide quantos processos um advogado consegue tocar.",
    "notes": "",
    "ladderManual": "Você abre a petição antiga mais próxima, tira os fatos e reconstrói o argumento na mão pela décima quarta vez no mês.",
    "ladderAssisted": "Escolha o tipo de peça — inicial, contestação, apelação, REsp — e o rascunho volta no template certo, ancorado no próprio processo.",
    "ladderAutonomous": "Um processo chegando no prazo dispara o rascunho da peça necessária contra a biblioteca de templates, esperando na revisão antes de alguém pedir.",
    "human": "O advogado é dono da tese e de cada citação — a IA monta a estrutura, uma pessoa responde pelo direito que ela argumenta."
  },
  "Jurisprudência & Publicações": {
    "replaces": "O risco de perder prazo lendo o diário oficial na mão, e as horas caçando precedente em três tribunais pelo parágrafo que ganha o argumento.",
    "notes": "",
    "ladderManual": "Alguém lê o DJEN toda manhã e reza pra pegar cada publicação antes do relógio começar a correr.",
    "ladderAssisted": "As publicações do DJEN se capturam com estado de leitura/badge, e o precedente do STF, STJ e TST aparece na busca por trás de cada argumento.",
    "ladderAutonomous": "Toda publicação nova num processo monitorado é capturada, datada e sinalizada contra o prazo no dia em que cai no diário.",
    "human": "Um advogado decide qual precedente de fato governa — a busca acha candidatos, o julgamento escolhe o que vincula."
  },
  "Peticionamento com IA": {
    "replaces": "A semana de um advogado júnior e o gerente do escritório num só — entrada, redação, monitoramento do diário e protocolo que hoje competem com a hora faturável.",
    "notes": "",
    "ladderManual": "Uma equipe jurídica roda entrada, redação, monitoramento do diário e protocolo entre Word, email e um drive compartilhado, cada processo retocado na mão.",
    "ladderAssisted": "O escritório roda num único registro — cliente, processo, editor, geração, jurisprudência — e um advogado revisa cada rascunho da IA antes de assinar.",
    "ladderAutonomous": "Dentro de uma biblioteca de templates e uma política de prazos aprovadas, peças rotineiras se redigem e protocolam sozinhas enquanto teses novas e a assinatura esperam um advogado.",
    "human": "Um advogado inscrito assina cada peça e é dono da estratégia, dos prazos e da relação com o cliente — o software nunca advoga."
  },
  "Vagas & Carreiras": {
    "replaces": "O imposto da descrição de vaga em branco e a página de carreiras que ninguém atualiza — vagas que entram no ar atrasadas e parecem qualquer outro anúncio.",
    "notes": "",
    "ladderManual": "Você reescreve uma descrição de vaga do zero e cola numa página de carreiras três vagas desatualizada.",
    "ladderAssisted": "As vagas são geridas num lugar só, a descrição é rascunhada por IA pra cada cargo, e uma página pública de carreiras com a marca publica elas.",
    "ladderAutonomous": "Uma vaga aprovada publica na página de carreiras com a descrição gerada e a marca aplicada, sem passo manual de postagem.",
    "human": "Um gestor é dono dos requisitos e da faixa salarial — a IA escreve o pitch, uma pessoa decide o que a vaga de fato é."
  },
  "Candidatos & Banco de Talentos": {
    "replaces": "Os currículos que chegam em PDF e morrem numa caixa de entrada, mais a mina de candidatos antigos que ninguém consegue buscar quando a próxima vaga abre.",
    "notes": "",
    "ladderManual": "Os CVs se acumulam como anexos e o bom candidato do trimestre passado está inacessível porque ninguém marcou tag nele.",
    "ladderAssisted": "Um portal do candidato recebe as inscrições, a IA faz parse e pontua a qualidade de cada CV, e todo mundo cai num banco de talentos com tags pesquisáveis.",
    "ladderAutonomous": "Todo inscrito é parseado, pontuado e arquivado no banco de talentos na chegada, ressurgindo sozinho quando uma vaga compatível abre.",
    "human": "Um recrutador é dono das tags que importam e confere o parse por amostragem — um CV lido errado que enterra um bom candidato é a falha a pegar."
  },
  "Triagem por IA": {
    "replaces": "A noite lendo 200 inscrições pra achar os oito que valem uma call — esforço de triagem que cresce em linha reta com cada vaga.",
    "notes": "",
    "ladderManual": "Você passa o olho em cada inscrição na ordem e torce pra fadiga não enterrar o melhor candidato na posição 140.",
    "ladderAssisted": "Os inscritos são pontuados por fit e ranqueados, perguntas knockout filtram os claramente desqualificados, e um resumo por candidato diz o porquê antes de você abrir o CV.",
    "ladderAutonomous": "As inscrições se organizam em faixas na chegada contra os critérios da vaga; o shortlist já está pronto antes de o recrutador sentar.",
    "human": "O recrutador define as regras de knockout e audita as rejeições automáticas — o modelo ranqueia, uma pessoa é dona de quem fica de fora."
  },
  "Pipeline & Entrevistas": {
    "replaces": "A entrevista no feeling sem scorecard — bancas inconsistentes, feedback perdido e um Kanban que mora na cabeça de alguém.",
    "notes": "",
    "ladderManual": "Os candidatos andam entre etapas numa planilha e os entrevistadores comparam anotações de memória depois.",
    "ladderAssisted": "Um Kanban de ATS acompanha cada etapa com scorecards, kits de entrevista, vídeo-entrevistas e assessments no candidato.",
    "ladderAutonomous": "Transições de etapa, atribuição de kits e coleta de scorecard rodam no board; uma contratação precisa só do julgamento da banca, não do administrativo.",
    "human": "A banca é dona da decisão de contratar e dos pesos do scorecard — entra insumo estruturado, sai veredito humano."
  },
  "Sourcing & Propostas": {
    "replaces": "A armadilha de só postar e esperar inscritos numa vaga que precisa de sourcing ativo, e a proposta que empaca num thread de email com PDF.",
    "notes": "",
    "ladderManual": "Você posta e espera, depois corre atrás de uma proposta assinada por anexos e emails de lembrete.",
    "ladderAssisted": "A IA faz sourcing de candidatos passivos e os enriquece via LinkedIn e PDL, e as propostas saem assináveis eletronicamente.",
    "ladderAutonomous": "Buscas permanentes trazem candidatos passivos enriquecidos por vaga, e propostas aceitas voltam assinadas sem corrida manual.",
    "human": "Um recrutador aprova a lista de abordagem e é dono dos termos da proposta — o sourcing alarga o topo, uma pessoa decide quem buscar e por quanto."
  },
  "Recruta.AI": {
    "replaces": "O mês de um recrutador de mesa cheia — postar, triar, agendar, fazer sourcing e o administrativo de propostas — que um time em crescimento paga em headcount ou em contratações perdidas.",
    "notes": "",
    "ladderManual": "O recrutamento roda entre um site de vagas, uma caixa de entrada, uma planilha e um calendário, cada contratação remontada na mão.",
    "ladderAssisted": "Um único ATS leva a vaga da postagem à triagem, entrevistas e sourcing, com a IA rascunhando e ranqueando enquanto um recrutador decide.",
    "ladderAutonomous": "Dentro de um critério aprovado, entrada, triagem e agendamento rodam sozinhos enquanto propostas e decisões finais esperam uma pessoa.",
    "human": "Um recrutador é dono da régua, do critério e de cada proposta — a automação move candidatos, pessoas escolhem quem contratar."
  },
  "Razão & Bancos": {
    "replaces": "A tarde de conciliação do contador — casando linhas do banco com categorias na mão, toda semana, entre contas que nunca batem direito.",
    "notes": "",
    "ladderManual": "Alguém exporta o extrato e etiqueta cada transação numa planilha, chutando nas ambíguas.",
    "ladderAssisted": "As transações se auto-categorizam com IA e conciliam contra os movimentos do Banco Inter e as cobranças do Asaas, sinalizando o que não bate.",
    "ladderAutonomous": "Toda linha do banco categoriza e concilia na chegada; só exceções de verdade — um pagamento sem nota — chegam num humano.",
    "human": "Um responsável financeiro define o plano de contas e revisa as tags de baixa confiança — o razão só é confiável quanto as suas categorias."
  },
  "Motor Fiscal": {
    "replaces": "A emissão manual de notas e o risco de compliance de certificados, regras fiscais e manias municipais tocados por quem lembra deles.",
    "notes": "",
    "ladderManual": "As notas são emitidas uma a uma num portal do governo, com o certificado e os campos fiscais preenchidos de memória.",
    "ladderAssisted": "A emissão de NFS-e roda pela NFS-e Nacional e pela PlugNotas com certificados geridos, e um scanner OCR lê documentos que chegam pra dentro dos campos.",
    "ladderAutonomous": "Documentos fiscais emitem no evento que os dispara com o tratamento tributário certo, e documentos de entrada se extraem sozinhos pra dentro do razão.",
    "human": "Um responsável financeiro responde pelo tratamento tributário de cada nota — o motor emite, uma pessoa é dona do compliance."
  },
  "ERP & Relatórios": {
    "replaces": "As planilhas desconectadas de produtos, pedidos e o resultado — um DRE que leva um dia pra montar e já está velho quando é lido.",
    "notes": "",
    "ladderManual": "Produtos, pedidos e a demonstração de resultado moram em planilhas separadas que alguém costura no fechamento do mês.",
    "ladderAssisted": "Contatos, produtos e pedidos de venda/compra dividem um sistema só, e o DRE se monta a partir do plano de contas.",
    "ladderAutonomous": "Os pedidos lançam no razão e o DRE recalcula continuamente — o resultado é uma visão viva, não um projeto mensal.",
    "human": "Um responsável financeiro valida a estrutura do DRE e os números que saem da empresa — o ERP calcula, uma pessoa certifica."
  },
  "Copiloto CFO & Alertas": {
    "replaces": "O relatório mensal do CFO fracionado — previsão de caixa e 'o que mudou' — que um founder senão pega olhando o saldo do banco.",
    "notes": "",
    "ladderManual": "Você olha o saldo, se sente bem ou com medo, e descobre o buraco de caixa na semana em que ele chega.",
    "ladderAssisted": "Um copiloto CFO responde perguntas sobre o razão vivo, projeta o fluxo de caixa e levanta alertas proativos do que está indo pro lado errado.",
    "ladderAutonomous": "Runway e projeções de caixa se atualizam conforme o dinheiro se move, e limiares estourados se levantam sozinhos antes de virarem urgência.",
    "human": "Um responsável financeiro é dono das premissas e das decisões que vêm delas — o copiloto faz a conta e mostra o trabalho; as decisões seguem humanas."
  },
  "Vagas & Recrutadores": {
    "replaces": "O overhead de coordenação do recrutamento — quem é dono de qual vaga, em que tipo de contrato, dividido entre recrutadores interno, agência e freelance — controlado num thread de chat.",
    "notes": "",
    "ladderManual": "As vagas e quem está tocando elas moram num grupo de chat, e ninguém tem certeza de qual agência é dona de qual vaga.",
    "ladderAssisted": "As vagas são definidas com tipo de contrato, senioridade, área, PCD e faixa salarial, e distribuídas a recrutadores interno, de agência ou freelance na plataforma.",
    "ladderAutonomous": "Vagas novas roteiam pro pool de recrutador certo por regra, com propriedade e distribuição controladas sem um coordenador.",
    "human": "Um líder de contratação é dono da definição da vaga e das atribuições de recrutador — a plataforma distribui, uma pessoa decide quem toca o quê."
  },
  "Candidatos & Currículo": {
    "replaces": "O CV do WhatsApp que chega como foto e o dado estruturado que ninguém extrai — inscritos que se candidatam por mensagem e somem no rolar do chat.",
    "notes": "",
    "ladderManual": "Os candidatos mandam o CV pelo WhatsApp e alguém redigita os destaques numa nota, se chegar a fazer.",
    "ladderAssisted": "Os inscritos do WhatsApp são capturados, os CVs viram JSON estruturado a partir de PDF/DOCX, e blocos de memória de RH guardam o que importa por candidato.",
    "ladderAutonomous": "Todo CV que entra vira campos estruturados no recebimento e atualiza a memória de RH do candidato, pronta pro agente raciocinar em cima.",
    "human": "Um recrutador confere o parse nos CVs limítrofes — uma foto de currículo é o insumo mais sujo do recrutamento, e o registro herda os erros dela."
  },
  "Chat WhatsApp & Agente Bia": {
    "replaces": "O recrutador respondendo as mesmas perguntas de candidato no WhatsApp o dia todo, e o bom inscrito que esfria esperando resposta.",
    "notes": "",
    "ladderManual": "Um recrutador responde as perguntas do WhatsApp uma a uma e agenda entrevistas entre outras tarefas, então as respostas atrasam horas.",
    "ladderAssisted": "Uma inbox de WhatsApp em tempo real mais a Bia — o agente de IA — recomenda vagas, qualifica o candidato e propõe horários de entrevista no thread.",
    "ladderAutonomous": "A Bia cuida do primeiro contato, do match de vaga e do agendamento 24 horas por dia; um recrutador entra nas decisões de julgamento.",
    "human": "Um recrutador é dono do tom e da régua de qualificação, e segue responsável pelo que a Bia diz no nome da empresa no celular de um candidato."
  },
  "Pipeline de Candidatos": {
    "replaces": "O candidato que empaca entre etapas porque ninguém lembra da última conversa — a deriva do pipeline que perde contratações no silêncio.",
    "notes": "",
    "ladderManual": "Os candidatos ficam nas etapas de um board e o recrutador reconstrói cada histórico antes de cada toque.",
    "ladderAssisted": "Um Kanban de etapas carrega os insights da Bia — score, próxima ação, interesses — e o histórico completo da conversa em cada card.",
    "ladderAutonomous": "Os candidatos avançam com a próxima melhor ação computada e exibida; o board diz ao recrutador quem mover e por quê.",
    "human": "O recrutador dá as decisões de etapa — a Bia recomenda a próxima ação, uma pessoa decide se o candidato merece."
  },
  "Agendamento & Lembretes": {
    "replaces": "Os no-shows de entrevista que ninguém cobrou e o vai-e-volta de agendamento que come a manhã de um recrutador.",
    "notes": "",
    "ladderManual": "Os horários de entrevista são combinados por mensagem e esquecidos, e os no-shows são descobertos quando a sala fica vazia.",
    "ladderAssisted": "Um calendário de entrevistas reserva o horário e lembretes D-1/D-0 saem via templates HSM da Meta.",
    "ladderAutonomous": "Entrevistas confirmadas se agendam sozinhas e os lembretes disparam na cadência; um no-show dispara uma oferta de reagendamento automaticamente.",
    "human": "O recrutador define as janelas de entrevista e confirma exceções — os lembretes rodam, uma pessoa é dona do caso fora da curva."
  },
  "Bia RH": {
    "replaces": "Uma coordenadora de recrutamento que vive no WhatsApp — triando, dando match, agendando e lembrando — um papel que a maioria dos times pequenos não consegue ter e por isso faz mal.",
    "notes": "",
    "ladderManual": "Recrutamento-pelo-WhatsApp é uma pessoa copiando e colando entre chats, um board e um calendário o dia todo.",
    "ladderAssisted": "A Bia RH triam candidatos no WhatsApp, gere as vagas e agenda entrevistas, com um recrutador revisando os matches e as mensagens.",
    "ladderAutonomous": "Dentro de uma régua aprovada, a Bia roda entrada, match e agendamento de ponta a ponta enquanto um recrutador cuida das exceções e das propostas.",
    "human": "Um recrutador é dono da régua de contratação e de cada mensagem enviada como a empresa — a Bia faz o corpo a corpo, uma pessoa é dona da experiência do candidato."
  },
  "Trilhas de Onboarding": {
    "replaces": "As primeiras semanas do novo contratado rodando de um checklist na cabeça de alguém — etapas puladas, documentos cobrados e uma experiência diferente pra cada pessoa.",
    "notes": "",
    "ladderManual": "O onboarding é um documento que o gestor improvisa, então metade das etapas é pulada.",
    "ladderAssisted": "As trilhas são montadas por dia de vencimento e tipo de etapa — checklist, vídeo, leitura, documento, reunião — pra cada pessoa seguir o mesmo caminho.",
    "ladderAutonomous": "A trilha se desenrola sozinha no cronograma, cada etapa liberando no seu dia de vencimento sem um coordenador empurrando.",
    "human": "O people-ops é dono do que um bom primeiro mês contém — o construtor sequencia, uma pessoa desenha."
  },
  "Portal do Colaborador": {
    "replaces": "O novo contratado cutucando o gestor pra saber 'o que eu faço hoje' e 'onde eu subo isso' — atrito que soa como desorganização no primeiro dia.",
    "notes": "",
    "ladderManual": "A pessoa que entrou manda email perguntando qual é o próximo passo e onde vai o contrato dela, e espera.",
    "ladderAssisted": "Um portal 'Hoje' / 'Minha trilha' mostra o checklist da semana e um cofre de documentos guarda o que ela precisa enviar.",
    "ladderAutonomous": "O portal mostra as tarefas de cada dia e coleta os documentos conforme vencem, então a pessoa se serve do caminho inteiro.",
    "human": "Um gestor segue disponível pras perguntas humanas que o portal não responde — o checklist roda, uma pessoa faz parecer acolhedor."
  },
  "Espaço do Gestor": {
    "replaces": "O gestor no escuro sobre onde cada liderado está na integração — 1:1s e feedback que só acontecem quando sobra um momento.",
    "notes": "",
    "ladderManual": "Um gestor acompanha o onboarding dos liderados de memória e pula 1:1s quando a semana aperta.",
    "ladderAssisted": "Um espaço do gestor mostra o time, cada liderado, a agenda da semana, os 1:1s e os feedbacks numa visão só.",
    "ladderAutonomous": "Status de integração, cadência de 1:1 e lembretes de feedback aparecem pro gestor automaticamente, pra nada escorregar no silêncio.",
    "human": "O gestor é dono da relação e do feedback — o espaço mostra o que precisa de atenção, uma pessoa faz a gestão."
  },
  "Automações WhatsApp & Insights IA": {
    "replaces": "A mensagem de boas-vindas e os lembretes que ninguém manda com consistência, mais uma pilha de feedback que ninguém lê em busca de padrões.",
    "notes": "",
    "ladderManual": "Os lembretes saem quando alguém lembra, e os resultados de feedback ficam sem ler numa planilha.",
    "ladderAssisted": "Gatilhos de boas-vindas e lembrete disparam por dia e hora no WhatsApp, e a IA extrai insights da base de feedback.",
    "ladderAutonomous": "Os lembretes saem no cronograma e os temas de feedback aparecem conforme se acumulam, sinalizando cedo uma turma que está sofrendo.",
    "human": "O people-ops decide o que o dado quer dizer e o que mudar — a automação envia, uma pessoa age no sinal."
  },
  "OnboardIA": {
    "replaces": "Um coordenador de onboarding por turma — montando trilhas, cobrando documentos, cutucando gestores e lendo feedback — trabalho que cresce com cada contratação.",
    "notes": "",
    "ladderManual": "O onboarding é uma pessoa costurando um documento, uma pasta, um calendário e um thread de WhatsApp pra cada pessoa que entra.",
    "ladderAssisted": "A OnboardIA roda trilhas multi-tenant com documentos, feedback e automações, enquanto o people-ops revisa e ajusta.",
    "ladderAutonomous": "Trilhas, lembretes e coleta de documentos rodam sozinhos por pessoa; o people-ops cuida das exceções e lê as tendências.",
    "human": "O people-ops é dono da experiência e da política — a OnboardIA roda a mecânica, uma pessoa é dona de como é entrar."
  },
  "Inbox de Conversas": {
    "replaces": "O WhatsApp de suporte que é só um celular compartilhado — sem filas, sem filtros, e mensagens perdidas num rolar único.",
    "notes": "",
    "ladderManual": "Todo mundo vigia um número de WhatsApp e torce pra duas pessoas não responderem o mesmo cliente.",
    "ladderAssisted": "Uma inbox de helpdesk em tempo real filtra por instância, fila e pills rápidas pra cada atendente ver só as suas conversas.",
    "ladderAutonomous": "As conversas roteiam pra fila certa na chegada; um atendente abre a visão filtrada dele e começa, sem triagem.",
    "human": "Um líder de suporte define as filas e os filtros — a inbox organiza, uma pessoa é dona de como o trabalho é dividido."
  },
  "Chat & Mensagens": {
    "replaces": "A experiência travada de WhatsApp-no-notebook — sem resposta citada, sem reação, sem janela de edição — que deixa o atendente mais lento que o cliente.",
    "notes": "",
    "ladderManual": "Os atendentes digitam no celular, não citam nem editam, e perdem o fio de quem disse o quê.",
    "ladderAssisted": "O balcão lida com texto, áudio, mídia, emoji, respostas citadas, reações e uma janela de edição de 15 minutos como um cliente nativo.",
    "ladderAutonomous": "O tratamento rico de mensagens — mídia, citações, reações — é padrão em toda conversa, então o canal nunca é o gargalo.",
    "human": "O atendente ainda escreve a resposta que importa — o balcão só deixa a troca de mensagens rápida e completa."
  },
  "Camada de Leitura por IA": {
    "replaces": "O atendente lendo cada thread longo do começo pra pegar o clima e o pedido — trabalho de compreensão repetido em toda conversa.",
    "notes": "",
    "ladderManual": "Um atendente rola o thread inteiro pra descobrir se o cliente está bravo e o que ele de fato precisa.",
    "ladderAssisted": "Uma camada de leitura por IA pontua sentimento no limiar de 5 mensagens, categoriza o tópico, resume o thread e oferece três respostas smart.",
    "ladderAutonomous": "Toda conversa chega pré-lida — sentimento, tópico, resumo e opções de resposta anexados — pro atendente começar do entendimento, não do rolar.",
    "human": "O atendente escolhe qual resposta smart mandar e quando sobrescrever — a camada lê, uma pessoa decide."
  },
  "Filas, Transferência & Equipe": {
    "replaces": "A confusão de 'quem está cuidando disso?' — transferências sem contexto e escalonamentos que dependem de marcar alguém num grupo de chat.",
    "notes": "",
    "ladderManual": "As conversas são passadas de boca, o contexto se perde na transferência, e escalar é dar um tapa no ombro do colega.",
    "ladderAssisted": "Regras de atribuição, transferências com motivo, caminhos de escalonamento e papéis da equipe governam quem é dono de cada conversa.",
    "ladderAutonomous": "As conversas se atribuem, transferem e escalam por regra com o contexto junto; só exceções de verdade precisam de um humano pra rotear.",
    "human": "Um líder de suporte é dono das regras de roteamento e da régua de escalonamento — o sistema move conversas, uma pessoa define a política."
  },
  "Atendimento Multi-Agentes · DESK": {
    "replaces": "A operação inteira de um time de suporte no WhatsApp — inbox, filas, leitura e escalonamento — que um número compartilhado e um grupo de chat não sustentam além de poucos atendentes.",
    "notes": "",
    "ladderManual": "Suporte multi-agente no WhatsApp é um celular compartilhado, um grupo de chat e reza pra nada cair.",
    "ladderAssisted": "Um balcão roda múltiplas instâncias e atendentes com leitura por IA e regras de fila, enquanto pessoas cuidam dos casos sensíveis.",
    "ladderAutonomous": "Caminhos de FAQ documentados respondem e roteiam dentro de limites aprovados; contexto faltando, reclamações e casos sensíveis param pra um humano.",
    "human": "Um dono do suporte define tom, propriedade de fila e a matriz de escalonamento — o balcão roteia e rascunha, pessoas são donas das conversas difíceis."
  },
  "Contas & Customer 360": {
    "replaces": "O contexto do cliente espalhado entre um CRM, uma ferramenta de cobrança e uma inbox de suporte — nenhum lugar único que responda 'qual é o estado desta conta?'",
    "notes": "",
    "ladderManual": "Você abre três abas pra reconstruir os contratos, tickets e histórico de uma conta antes de uma call.",
    "ladderAssisted": "Uma lista de clientes mais uma visão 360 — contatos, contratos, tickets, playbooks, timeline — com campos custom e importação, sincronizada do CRM.",
    "ladderAutonomous": "Os registros de conta se montam e ficam atuais a partir dos sistemas conectados, então o 360 está sempre vivo, não uma coleta manual.",
    "human": "Um dono de CS define os campos que importam e mantém a fonte da verdade honesta — o 360 agrega, uma pessoa cura."
  },
  "Health Score & Dashboard": {
    "replaces": "Descobrir que uma conta estava sem saúde no email de cancelamento — saúde medida no feeling do CSM, não num número que alguém consiga ver.",
    "notes": "",
    "ladderManual": "A saúde da conta é uma sensação que o CSM tem, lembrada no desespero perto da renovação.",
    "ladderAssisted": "Uma home computa a saúde por conta com pipeline de renovação, alertas, as tarefas do dia, NPS e tickets numa visão só.",
    "ladderAutonomous": "A saúde recalcula continuamente e o dashboard reprioriza as tarefas do dia conforme as contas se movem.",
    "human": "O CSM decide o que uma queda de saúde significa pra uma conta específica — o score revela o risco, uma pessoa julga."
  },
  "Playbooks & Alertas de Risco": {
    "replaces": "O resgate que nunca aconteceu porque o sinal de risco — queda de saúde, pagamento em atraso, sentimento caindo — não chegou em ninguém até ser tarde.",
    "notes": "",
    "ladderManual": "O risco é notado tarde e o playbook de retenção é improvisado, diferente cada vez.",
    "ladderAssisted": "Os playbooks disparam gatilho-para-ação com sugestões de IA, e o early-warning sinaliza risco a partir de saúde, pagamento, churn e sentimento.",
    "ladderAutonomous": "Um limiar de risco cruzado dispara o playbook certo automaticamente, rascunhado e na fila, antes da temporada de renovação.",
    "human": "O CSM aprova o playbook e é dono da relação com o cliente — a automação pega o sinal, uma pessoa decide como responder."
  },
  "Renovações & Contratos": {
    "replaces": "A renovação que venceu porque a data morava numa planilha, e o MRR que ninguém sabia dizer sem um export do financeiro.",
    "notes": "",
    "ladderManual": "Datas de renovação e MRR são reconstruídas na mão todo mês, e uma sempre escapa.",
    "ladderAssisted": "Contratos, MRR e os próximos 30 dias de renovações aparecem juntos com os tickets de suporte da conta.",
    "ladderAutonomous": "As renovações que vêm se sinalizam a tempo de agir, com MRR e termos do contrato juntos, amarradas à cobrança via Asaas e Iugu.",
    "human": "Um dono de CS conduz a conversa de renovação — o sistema revela o que vence, uma pessoa fecha."
  },
  "NPS & Copiloto de IA": {
    "replaces": "A pesquisa de NPS que ninguém roda e o resumo de cliente que um CSM reconstrói na mão antes de cada toque.",
    "notes": "",
    "ladderManual": "A satisfação é chute, e se preparar pra uma call de cliente é reler meses de histórico.",
    "ladderAssisted": "As pesquisas de NPS saem por email com rastreio de promotores/detratores, e um copiloto de IA pontua churn, resume a conta e rascunha respostas de WhatsApp.",
    "ladderAutonomous": "As pesquisas saem na cadência, os scores de churn se atualizam e os resumos de conta ficam atuais pra quem abrir o registro.",
    "human": "O CSM é dono do que vai pro cliente — o copiloto rascunha e pontua, uma pessoa envia e decide."
  },
  "Plataforma de CS": {
    "replaces": "O trabalho de carteira inteiro de um gerente de sucesso do cliente — vigiar saúde, playbooks de risco, renovações, NPS e preparo de conta — que cresce com cada logo, não com o time.",
    "notes": "",
    "ladderManual": "O CS roda entre um CRM, uma ferramenta de cobrança, planilhas e memória, cada conta remontada pra cada toque.",
    "ladderAssisted": "Uma plataforma carrega a carteira — saúde, playbooks, risco, renovações, NPS — com a IA rascunhando e pontuando enquanto o CSM decide.",
    "ladderAutonomous": "Saúde, playbooks de risco e lembretes de renovação rodam sozinhos por conta; o CSM cuida das conversas e das exceções.",
    "human": "Um dono de CS é dono de cada relação e de cada decisão de retenção — a plataforma revela e rascunha, pessoas fazem o resgate."
  },
  "Ideia & Perguntas Cadenciadas": {
    "replaces": "A paralisia da página em branco no início de uma construção — uma ideia vaga sem ninguém fazendo as cinco perguntas que a viram um escopo.",
    "notes": "",
    "ladderManual": "Você encara um documento vazio tentando dar escopo a uma ideia que só consegue articular pela metade.",
    "ladderAssisted": "Um composer com ditado por voz pega a ideia e faz cinco perguntas de qualificação específicas a ela, uma por vez.",
    "ladderAutonomous": "A ideia é interrogada até um briefing claro por um Q&A cadenciado, então a construção parte de um problema com escopo, não de um palpite.",
    "human": "O founder é dono da ideia e das respostas — o wizard faz as perguntas certas, uma pessoa fornece a verdade."
  },
  "Base de Conhecimento & Framework": {
    "replaces": "As notas de discovery que nunca são sintetizadas — insights espalhados por uma call, sem um framework pra construir a solução em cima.",
    "notes": "",
    "ladderManual": "As respostas se acumulam sem estrutura e o framework por baixo nunca é nomeado.",
    "ladderAssisted": "O wizard sintetiza os insights e o Q&A obrigatório nos cinco pilares de implementação da solução.",
    "ladderAutonomous": "Uma base de conhecimento e um framework coerentes se geram a partir da entrada, prontos pra arquitetar em cima sem passo de síntese.",
    "human": "O founder valida os pilares contra a realidade — o wizard estrutura, uma pessoa confirma que é o formato certo."
  },
  "Arquitetura & Ferramentas": {
    "replaces": "A pesquisa de arquitetura de solução que um founder não consegue fazer sozinho — quais ferramentas, a que custo mensal, com quais alternativas — que senão leva dias de comparação.",
    "notes": "",
    "ladderManual": "Você chuta uma stack a partir de posts de blog e descobre o preço e os buracos depois de já ter se comprometido.",
    "ladderAssisted": "O wizard desenha o fluxo principal e os alternativos e uma stack de ferramentas com custo mensal, plano e alternativas por componente.",
    "ladderAutonomous": "Arquitetura e uma stack de ferramentas com custo se geram a partir do framework, com alternativas de troca prontas quando uma restrição muda.",
    "human": "O founder escolhe a stack que vai de fato rodar — o wizard propõe opções e custos, uma pessoa escolhe."
  },
  "Plano de Ação & Prompts": {
    "replaces": "A distância entre um plano e uma construção — sem quebra em sprints, sem prompts prontos, só uma ideia e um projeto Lovable vazio.",
    "notes": "",
    "ladderManual": "Você sabe o que quer e ainda tem que inventar a lista de tarefas e escrever cada prompt de construção do zero.",
    "ladderAssisted": "O wizard produz 3-4 sprints de tarefas priorizadas e 6-10 prompts prontos pra colar no Lovable.",
    "ladderAutonomous": "Um plano de sprints e um pacote de prompts se geram a partir da arquitetura, então construir começa colando, não planejando.",
    "human": "O builder roda os sprints e adapta os prompts — o wizard entrega um plano, uma pessoa executa."
  },
  "Conteúdos & Economia": {
    "replaces": "A pergunta 'vale a pena construir?' respondida no feeling — sem conta de ROI, sem saber quais aulas fecham a lacuna de skill de cada sprint.",
    "notes": "",
    "ladderManual": "Você começa a construir sem saber o que aquilo substitui em salário nem qual aula desbloqueia o próximo passo.",
    "ladderAssisted": "O wizard recomenda aulas por sprint e computa o ROI — a economia versus os profissionais que a construção substitui.",
    "ladderAutonomous": "Cada sprint chega com suas aulas recomendadas e uma visão de economia corrente, então aprendizado e payback acompanham o plano.",
    "human": "O founder decide se o retorno justifica a construção — o wizard faz a conta, uma pessoa toma a decisão."
  },
  "Genesis": {
    "replaces": "Um product manager, um arquiteto de soluções e um analista de custos pro primeiro dia de uma construção — o trabalho de escopo que trava a maioria das ideias antes de começarem.",
    "notes": "",
    "ladderManual": "Transformar uma ideia num plano construível é dias de escopo, arquitetura e precificação feitos na mão, se é que são feitos.",
    "ladderAssisted": "O Genesis leva a ideia por perguntas, framework, arquitetura, plano e economia até um blueprint de 8 etapas que o founder revisa.",
    "ladderAutonomous": "De uma ideia descrita, o blueprint completo se gera sozinho — perguntas, pilares, stack, sprints, prompts e ROI — pronto pra construir.",
    "human": "O founder é dono da ideia e de cada segue/não-segue — o Genesis produz o blueprint, uma pessoa decide construir."
  },
  "Gerenciador de Campanhas & Anúncios": {
    "replaces": "O ficar trocando de aba pro Ads Manager pra fazer cada mudança rotineira — uma estrutura de campanha editada na mão, um objeto de cada vez.",
    "notes": "",
    "ladderManual": "Você entra no Ads Manager e clica por campanhas, conjuntos, anúncios e criativos pra fazer cada mudança.",
    "ladderAssisted": "Campanhas, conjuntos, anúncios e criativos são geridos por completo sobre a Graph API sem morar na ferramenta nativa.",
    "ladderAutonomous": "Mudanças estruturais rotineiras aplicam pela API na aprovação, então a conta se edita sozinha dentro de limites definidos.",
    "human": "Um mídia é dono da estrutura da conta e do que entra no ar — a camada executa as mudanças, uma pessoa autoriza."
  },
  "Copiloto de Mídia (IA)": {
    "replaces": "A manhã lendo o Ads Manager pra achar o que ganhou, o que está sangrando e o que fazer — análise que o mídia repete antes de cada decisão.",
    "notes": "",
    "ladderManual": "Você lê os números de ontem entre as campanhas e tenta segurar winners e bleeders na cabeça.",
    "ladderAssisted": "Um copiloto Anthropic tool-use lê os dados do Meta e entrega um briefing matinal — winners, bleeders e ações recomendadas.",
    "ladderAutonomous": "O briefing e suas ações recomendadas se geram toda manhã a partir dos dados vivos da conta, esperando o mídia aprovar.",
    "human": "O mídia decide qual recomendação executar — o copiloto lê e propõe, uma pessoa compromete a verba."
  },
  "Otimizador & Regras": {
    "replaces": "O criativo deixado rodando até fatigar e os ajustes de verba feitos tarde demais — otimização que depende de um mídia vigiando o dia todo.",
    "notes": "",
    "ladderManual": "Um anúncio fatiga e segue gastando até alguém notar a frequência e pausar na mão.",
    "ladderAssisted": "Detecção de fadiga criativa e regras por limiar pausam ou escalam anúncios quando os números cruzam uma linha.",
    "ladderAutonomous": "As regras rodam continuamente — criativos fatigados pausam e os provados escalam — dentro de guardrails, sem um mídia vigiando.",
    "human": "O mídia define os limiares e os guardrails — as regras agem, uma pessoa é dona de onde ficam as linhas."
  },
  "Conciliação de Receita": {
    "replaces": "Otimizar pra um ROAS de pixel que mente — escalar uma campanha que a plataforma chama de winner enquanto o CRM mostra que nunca fechou.",
    "notes": "",
    "ladderManual": "Você confia no ROAS reportado pela plataforma e descobre pelo financeiro meses depois que ele não bateu com a receita.",
    "ladderAssisted": "A correlação por UTM amarra a verba ao CRM e à loja, então o ROAS real — não o de pixel — está na mesa antes de mexer no orçamento.",
    "ladderAutonomous": "A receita real concilia contra a verba continuamente, então as decisões de otimização leem dinheiro fechado, não dinheiro atribuído pela plataforma.",
    "human": "O mídia é dono das decisões de orçamento — a conciliação mostra o número verdadeiro, uma pessoa decide o que financiar."
  },
  "Fontes & Marca": {
    "replaces": "O conteúdo que parte de uma página em branco porque nada o alimenta — sem ingestão de pesquisa, sem perfil de marca do qual a IA escreva na sua voz.",
    "notes": "",
    "ladderManual": "Você junta referências na mão e re-explica a voz da marca toda vez que passa um briefing pra um redator.",
    "ladderAssisted": "A pesquisa entra de busca IA, artigos, YouTube, TikTok e PDFs, e perfis de marca ancoram tudo como raiz.",
    "ladderAutonomous": "Fontes e contexto de marca ficam abastecidos e atuais, então todo rascunho lá na frente parte ancorado em pesquisa e voz.",
    "human": "O dono da marca define a voz e aprova as fontes — a ingestão junta, uma pessoa define a identidade."
  },
  "Estúdio de Conteúdo": {
    "replaces": "O gargalo de designer-e-redator no conteúdo rotineiro — cada post, card, carrossel, imagem e vídeo feito do zero.",
    "notes": "",
    "ladderManual": "Cada peça é montada na mão numa ferramenta de design, um formato por vez, esperando quem é dono do template.",
    "ladderAssisted": "Um estúdio com copiloto de IA rascunha posts, cards, carrosséis, imagens e vídeo com geração assistida.",
    "ladderAutonomous": "As peças se geram sob briefing em todo formato, na fila pra revisão, então a produção não depende da tarde de uma pessoa.",
    "human": "O editor escolhe o que vai ao ar e ajusta a voz — o estúdio gera, uma pessoa é dona da qualidade."
  },
  "Agenda & Publicação": {
    "replaces": "A publicação feita na mão, app por app, na hora errada — e o calendário que só existe como memória do que saiu.",
    "notes": "",
    "ladderManual": "Alguém entra em cada rede pra postar, e a agenda mora na cabeça de uma pessoa.",
    "ladderAssisted": "Um calendário de publicação mais contas sociais conectadas via Post for Me agendam o conteúdo num lugar só.",
    "ladderAutonomous": "O conteúdo aprovado publica no seu horário do calendário pelo Post for Me entre as contas, sem postagem manual.",
    "human": "O dono da marca aprova o calendário — a publicação roda, uma pessoa é dona do que está agendado pra sair."
  },
  "Autopilot & Analytics": {
    "replaces": "O motor de conteúdo que para na semana em que não é dirigido na mão, e os analytics que ninguém transforma na próxima ideia.",
    "notes": "",
    "ladderManual": "A publicação trava quando o operador está ocupado, e o dado de performance é olhado mas nunca virado em ação.",
    "ladderAssisted": "Um Kanban de autopilot roda em cron sob guardrails, com analytics de perfil e post mais insights de IA.",
    "ladderAutonomous": "O loop de conteúdo roda sozinho sob guardas — publicando no cronograma, com os analytics alimentando a próxima rodada de ideias.",
    "human": "O dono da marca define os guardrails e lê as tendências — o autopilot roda, uma pessoa é dona da estratégia e da segurança."
  },
  "Automação de Redes Sociais": {
    "replaces": "A semana inteira de um time de conteúdo — pesquisa, produção, agendamento e report — comprimida pra uma voz de marca rodar muitos canais.",
    "notes": "",
    "ladderManual": "Social é um time pesquisando, desenhando e postando rede por rede, depois chutando o que funcionou.",
    "ladderAssisted": "O fluxo transforma temas aprovados e performance num calendário proposto e rascunhos, e um editor seleciona e agenda.",
    "ladderAutonomous": "Formatos recorrentes aprovados entram numa fila de publicação automaticamente; direitos, temas sensíveis e formatos novos param pra revisão.",
    "human": "Um dono de marca é dono da voz, das afirmações e dos direitos — a automação segue a política de publicação; ela não a escreve."
  },
  "Recepção & Agrupamento WhatsApp": {
    "replaces": "O lead que manda seis mensagens em rajada e um áudio que chegam como seis eventos, então o bot responde a primeira linha e ignora o resto.",
    "notes": "",
    "ladderManual": "As mensagens fragmentadas do WhatsApp são lidas uma a uma, e o agente responde antes de o cliente terminar de digitar.",
    "ladderAssisted": "Webhooks da Evolution e do Meta resolvem o tenant e a instância, e os fragmentos de mensagem mais a mídia se juntam num turno único.",
    "ladderAutonomous": "As rajadas de entrada se agrupam num turno limpo por lead automaticamente, então tudo lá na frente raciocina sobre a mensagem inteira, não sobre um fragmento.",
    "human": "Um operador mapeia as instâncias aos tenants uma vez — a recepção roda nos trilhos, uma pessoa é dona da config de roteamento."
  },
  "Orquestrador de IA (Bia)": {
    "replaces": "O SDR trocando de contexto entre conversas, recarregando o histórico de cada lead e digitando links de agendamento na mão em dezenas de threads.",
    "notes": "",
    "ladderManual": "Um SDR malabarista entre muitos chats, reconstruindo o contexto de cada lead e colando links de calendário manualmente.",
    "ladderAssisted": "O orquestrador drena a fila, carrega o prompt e o contexto do lead, quebra as respostas de forma natural e dispara tool-calls de agendamento.",
    "ladderAutonomous": "As conversas rodam pelo orquestrador de ponta a ponta — contexto carregado, respostas cadenciadas, agendamentos disparados — com o SDR nas exceções.",
    "human": "Vendas é dono do prompt e das regras de agendamento — o orquestrador roda o loop, uma pessoa define como a Bia se comporta."
  },
  "Qualificação & Base de Conhecimento": {
    "replaces": "A qualificação que deriva porque cada rep faz perguntas diferentes, e responde as dúvidas de produto do lead de memória, errado.",
    "notes": "",
    "ladderManual": "Cada SDR qualifica na ordem dele e responde dúvidas de produto de docs lembrados pela metade.",
    "ladderAssisted": "Um loop consultivo de 16 estágios roda com a base de conhecimento — embeddings — injetada no prompt da Bia pra as respostas serem ancoradas.",
    "ladderAutonomous": "A qualificação segue o loop em estágios de forma consistente e responde a partir da base de conhecimento, então todo lead recebe o mesmo rigor.",
    "human": "Vendas é dono dos estágios de qualificação e dos docs de fonte — o loop executa, uma pessoa define o que é 'qualificado'."
  },
  "Disparos & Campanhas": {
    "replaces": "O disparo em massa mandado na mão de um número só — sem validação, sem cadência, e sem jeito de pausar quando algo está errado.",
    "notes": "",
    "ladderManual": "Você cola uma lista e dispara mensagens uma a uma, sem jeito de parar um envio ruim depois que já está rodando.",
    "ladderAssisted": "Um assistente de campanha por CSV valida a lista e um processador de disparos em fila envia com controle de pausar e retomar.",
    "ladderAutonomous": "As campanhas validam, cadenciam e enviam da fila dentro de limites, se auto-throttling e se pausando num problema.",
    "human": "Vendas é dono da lista, da mensagem e do consentimento — o processador envia, uma pessoa responde por quem é contatado."
  },
  "Contatos & Empresas": {
    "replaces": "Os contatos espalhados por caixas de entrada e planilhas, duplicados e sem dono, então ninguém confia na lista.",
    "notes": "",
    "ladderManual": "Os contatos moram em caixas de entrada pessoais e CSVs, com a mesma empresa escrita de três jeitos.",
    "ladderAssisted": "Contatos e empresas são geridos com tags, segmentos, importação de CSV e uma visão por dono numa base só.",
    "ladderAutonomous": "Os registros deduplicam e segmentam conforme chegam, mantendo uma base limpa e com dono sem uma passada de limpeza.",
    "human": "Um líder de vendas é dono do esquema de segmentação — o CRM guarda e etiqueta, uma pessoa decide como a carteira é organizada."
  },
  "Negócios & Pipeline": {
    "replaces": "O pipeline numa planilha sem disciplina de qualificação — um forecast que é chute e negócios perdidos com que ninguém aprende.",
    "notes": "",
    "ladderManual": "Os negócios andam numa planilha, o BANT é opcional, e o forecast é o que o rep sente nesta semana.",
    "ladderAssisted": "Um Kanban drag-and-drop roda os negócios com qualificação BANT, um forecast e razões de perda capturadas.",
    "ladderAutonomous": "Os negócios avançam com a qualificação obrigatória e o forecast recalculando conforme as etapas mudam; as razões de perda se consolidam sozinhas.",
    "human": "O rep é dono do julgamento do negócio — o pipeline estrutura o processo, uma pessoa dá a etapa."
  },
  "Inbox & Cadências": {
    "replaces": "O follow-up que nunca acontece porque é manual, e o histórico de email preso num Gmail pessoal que o time não enxerga.",
    "notes": "",
    "ladderManual": "Os follow-ups dependem de um rep lembrar, e o histórico de email é invisível pra todo mundo menos pra quem enviou.",
    "ladderAssisted": "Uma caixa de emails com sync do Gmail roda templates e cadências multi-passo com tracking de abertura e clique.",
    "ladderAutonomous": "As cadências enviam e avançam sozinhas com tracking, então todo contato recebe a sequência sem um rep empurrando.",
    "human": "O rep é dono da mensagem e de quando quebrar a cadência — a sequência roda, uma pessoa cuida da resposta."
  },
  "Lead Scoring & Automações": {
    "replaces": "O lead quente tratado como frio porque o CRM não pontua, e o trabalho manual de mover etapas e disparar notificações na mão.",
    "notes": "",
    "ladderManual": "Todo lead recebe o mesmo esforço e cada mudança de etapa, email e alerta é feito na mão.",
    "ladderAssisted": "Regras de lead scoring organizam a lista em faixas e um motor gatilho-para-ação dispara email, mudança de etapa, webhooks e WhatsApp.",
    "ladderAutonomous": "Os scores dirigem o roteamento e o motor de automação roda os passos mecânicos, então os reps tocam pessoas, não processo.",
    "human": "O líder de vendas é dono do modelo de scoring e das regras de automação — o motor age, uma pessoa afina o que dispara."
  },
  "Copiloto de IA (CRM)": {
    "replaces": "O coaching de sales manager que um rep só pega num 1:1 semanal — insights de negócio e próximos passos que senão dependem de alguém sênior ter tempo.",
    "notes": "",
    "ladderManual": "Um rep pega conselho de negócio uma vez por semana, se o gestor tiver um horário.",
    "ladderAssisted": "Um copiloto contextual dá insights e sugestões de 'sales manager', resumos e análise sobre o CRM via LLM.",
    "ladderAutonomous": "Todo negócio carrega sua sugestão de próximo passo e seu resumo, então o coaching está no registro, não na agenda.",
    "human": "O rep é dono da conta e o gestor é dono da decisão — o copiloto sugere, pessoas decidem."
  },
  "FlowCRM": {
    "replaces": "Um admin de CRM mais uma contratação de sales-ops — pipeline, email, scoring, automações e report — que um time B2B em crescimento normalmente improvisa entre ferramentas.",
    "notes": "",
    "ladderManual": "Vendas roda numa planilha, numa caixa de entrada pessoal e em lembretes, sem uma fonte da verdade compartilhada.",
    "ladderAssisted": "Um CRM carrega contatos, pipeline, email, scoring e automações, com um copiloto de IA sugerindo enquanto os reps decidem.",
    "ladderAutonomous": "Scoring, cadências e automações rodam sozinhos e o copiloto aconselha por negócio; os reps são donos das conversas.",
    "human": "Um líder de vendas é dono do processo e de cada decisão de negócio — o FlowCRM roda a maquinaria, pessoas conduzem as relações."
  },
  "Fontes de Dados": {
    "replaces": "O dashboard que fica desatualizado no instante em que é montado porque o dado foi colado na mão de quatro lugares.",
    "notes": "",
    "ladderManual": "Você exporta um CSV, cola numa planilha, e os números já estão velhos antes de o gráfico renderizar.",
    "ladderAssisted": "As fontes conectam e sincronizam — upload de CSV/Excel, Google Sheets por OAuth, Pipedrive e um webhook JSON genérico.",
    "ladderAutonomous": "As fontes conectadas se atualizam sozinhas, então o dashboard sempre lê dado vivo, não o export da semana passada.",
    "human": "Um dono do dado decide quais fontes são confiáveis — a conexão sincroniza, uma pessoa avaliza."
  },
  "Geração por IA": {
    "replaces": "O analista de BI que você contrata só pra transformar uma pergunta em linguagem natural num dashboard que funciona — dias montando gráfico pra uma visão só.",
    "notes": "",
    "ladderManual": "Você descreve o que quer pra uma pessoa de BI e espera dias por um dashboard que fica perto, mas não exatamente.",
    "ladderAssisted": "De um prompt em texto, a config do dashboard se gera em streaming, com avaliação de clareza e cache por hash.",
    "ladderAutonomous": "Uma pergunta descrita vira um dashboard renderizado sob demanda, cacheado e checado por clareza, sem um analista no meio.",
    "human": "Quem pede é dono de se o dashboard responde a pergunta de verdade — a geração constrói, uma pessoa julga se serve."
  },
  "Editor & Widgets": {
    "replaces": "A construção chata de dashboard — arrastar widgets e ligar cada um ao campo certo — que faz mudanças pequenas custarem uma tarde.",
    "notes": "",
    "ladderManual": "Cada widget é posicionado e ligado a um campo de dado na mão, e uma mudança de layout significa re-ligar vários.",
    "ladderAssisted": "Um editor em grid com autosave oferece widgets de KPI, linha, barra, pizza, tabela e meta com data-binding assistido por IA.",
    "ladderAutonomous": "Os widgets se ligam aos campos certos automaticamente conforme o layout muda, então editar é arranjar, não re-ligar.",
    "human": "O builder é dono do layout e de qual métrica vai onde — o editor liga, uma pessoa desenha a visão."
  },
  "Filtros & Refino por IA": {
    "replaces": "A mudança 'dá pra mostrar também o trimestre passado?' que significa reconstruir a visão — iteração que morre porque cada ajuste é manual.",
    "notes": "",
    "ladderManual": "Uma pergunta de acompanhamento significa reconstruir o dashboard, então a análise para na primeira versão.",
    "ladderAssisted": "A comparação de períodos mostra deltas e tendências, e o dashboard se refina iterativamente por chat.",
    "ladderAutonomous": "Refinamentos e comparações de período aplicam a partir de um pedido no chat, então a visão evolui com as perguntas que estão sendo feitas.",
    "human": "Quem pede dirige qual recorte importa — o refino aplica a mudança, uma pessoa decide o que comparar."
  },
  "Insights, Alertas & Compartilhar": {
    "replaces": "O dashboard que ninguém checa até o número já estar ruim — sem detecção de anomalia, sem alertas, e compartilhamento por print.",
    "notes": "",
    "ladderManual": "Um dashboard só é aberto quando alguém lembra, e é compartilhado como print num chat.",
    "ladderAssisted": "A IA revela insights e anomalias, alertas por limiar saem por email ou cron, e um link público com senha e embed por iframe compartilha.",
    "ladderAutonomous": "Anomalias e limiares estourados alertam sozinhos e a visão fica compartilhada ao vivo, então o dashboard chega nas pessoas antes de elas olharem.",
    "human": "Um dono do dado define os limiares e quem pode ver o link — os alertas disparam, uma pessoa é dona do que vale sinalizar e compartilhar."
  },
  "Painel IA": {
    "replaces": "Um analista de BI de retainer — conectando dados, montando dashboards e mantendo eles — pra times que precisam de resposta mais rápida que um ciclo de relatório.",
    "notes": "",
    "ladderManual": "BI significa exportar dados e montar gráficos na mão, então a maioria das perguntas nunca ganha um dashboard.",
    "ladderAssisted": "O Painel IA monta dashboards por linguagem natural sobre fontes conectadas, com a IA gerando e uma pessoa editando.",
    "ladderAutonomous": "Perguntas descritas viram dashboards vivos que se atualizam, refinam e alertam sozinhos; uma pessoa cura e lê.",
    "human": "Um dono do dado é dono de quais fontes são confiáveis e do que os números significam — a plataforma monta e vigia, pessoas interpretam."
  },
  "SDR Suite · Bia": {
    "replaces": "Referência de construção tradicional: 40–400 horas distribuídas entre seis perfis — desenvolvimento full-stack, gestão de produto, design UI/UX, engenharia de prompts/IA, análise de dados e QA/testes — com taxas de mercado brasileiras de R$35–90/h. A comparação documentada do Genesis usa uma faixa de economia típica de 75–90%; valide a estimativa contra o escopo real.",
    "notes": "Construa a partir dos três pré-requisitos antes de conectar um canal. O mapa atual de ferramentas marca Evolution API (WhatsApp) como obrigatória, ElevenLabs como opcional e Meta / WhatsApp oficial como alternativa ao Evolution. Defina por escrito os critérios de qualificação, o tratamento de consentimento e a passagem para uma pessoa; depois teste com transcrições representativas.",
    "ladderManual": "SDRs analisam cada lead, copiam o contexto da empresa para as conversas, fazem perguntas de qualificação e atualizam o funil manualmente.",
    "ladderAssisted": "A Bia prepara perguntas de qualificação ancoradas no contexto e sugere próximos passos; um SDR revisa a conversa e decide o que avança.",
    "ladderAutonomous": "Dentro de um ICP e de uma política de qualificação aprovados, a entrada e o acompanhamento rotineiros podem seguir um fluxo configurado, enquanto casos incertos ou de alto valor aguardam um SDR.",
    "human": "Vendas é responsável pelo ICP, pelos critérios de qualificação, pela oferta e por cada exceção. Uma pessoa aprova as mensagens e continua responsável por consentimento, regras do canal e passagem de atendimento."
  },
  "Multi-Agent Customer Service": {
    "replaces": "Referência de construção tradicional: 40–400 horas distribuídas entre seis perfis — desenvolvimento full-stack, gestão de produto, design UI/UX, engenharia de prompts/IA, análise de dados e QA/testes — com taxas de mercado brasileiras de R$35–90/h. A comparação documentada do Genesis usa uma faixa de economia típica de 75–90%; valide a estimativa contra o escopo real.",
    "notes": "Comece pela base de conhecimento aprovada da empresa, pelos limites do FAQ e pela matriz de escalonamento. O mapa atual de ferramentas marca Evolution API (WhatsApp) como obrigatória e Evolution Cloud como opcional apenas no modo cloud. Separe os papéis dos agentes por responsabilidade, exija respostas ancoradas nas fontes e interrompa o fluxo em vez de inventar uma política.",
    "ladderManual": "Atendentes procuram em documentos dispersos, respondem às mesmas perguntas no WhatsApp e decidem caso a caso quem assume e quando escalar.",
    "ladderAssisted": "O fluxo sugere respostas ancoradas no material aprovado e recomenda a fila responsável; uma pessoa do suporte revisa casos incertos ou sensíveis.",
    "ladderAutonomous": "Caminhos documentados de FAQ podem responder e encaminhar dentro de limites aprovados; falta de contexto, exceções de política, reclamações e casos sensíveis param para escalonamento humano.",
    "human": "Uma liderança de suporte define política, tom, responsabilidade das filas e critérios de escalonamento. Pessoas tratam exceções, dados sensíveis, reclamações e qualquer resposta que a base de conhecimento não consiga sustentar."
  },
  "FinanceAI": {
    "replaces": "Referência de construção tradicional: 40–400 horas distribuídas entre seis perfis — desenvolvimento full-stack, gestão de produto, design UI/UX, engenharia de prompts/IA, análise de dados e QA/testes — com taxas de mercado brasileiras de R$35–90/h. A comparação documentada do Genesis usa uma faixa de economia típica de 75–90%; valide a estimativa contra o escopo real.",
    "notes": "Ancore a construção nas regras da empresa, na geração de notas e no acompanhamento de pagamentos. O mapa atual de ferramentas marca Asaas, Banco Inter, NFS-e Nacional, PlugNotas e Evolution API (WhatsApp) como obrigatórios. Verifique a titularidade das contas, as regras fiscais, o comportamento dos provedores e os resultados em modo de teste antes da produção.",
    "ladderManual": "Pessoas montam notas, conferem o estado dos pagamentos em diferentes sistemas e copiam atualizações para mensagens e planilhas.",
    "ladderAssisted": "O fluxo prepara dados de notas e resumos do estado dos pagamentos a partir dos registros conectados; o financeiro revisa antes da emissão, do lançamento ou do contato com o cliente.",
    "ladderAutonomous": "Somente casos recorrentes validados seguem um calendário aprovado; divergências, exceções fiscais, reembolsos e registros incertos param em uma fila de revisão.",
    "human": "Uma pessoa responsável pelo financeiro continua respondendo pelo tratamento fiscal, pelas movimentações bancárias, pela correção das notas, pelo controle de acesso e por cada exceção. Nenhuma decisão de pagamento ou fiscal é delegada por padrão."
  },
  "Autonomous CMO Agent": {
    "replaces": "Referência de construção tradicional: 40–400 horas distribuídas entre seis perfis — desenvolvimento full-stack, gestão de produto, design UI/UX, engenharia de prompts/IA, análise de dados e QA/testes — com taxas de mercado brasileiras de R$35–90/h. A comparação documentada do Genesis usa uma faixa de economia típica de 75–90%; valide a estimativa contra o escopo real.",
    "notes": "Conecte a base de conhecimento da empresa a dados de performance e metas explícitas antes de gerar recomendações. O mapa central de ferramentas não tem entrada de CMO; o repo dedicado comprova Meta Ads e bridge OpenClaw. Configure somente esses caminhos, mantenha Google/LinkedIn como roadmap e registre a evidência de cada decisão proposta.",
    "ladderManual": "A liderança de marketing reúne relatórios, compara os dados com as metas e transforma os achados em prioridades de campanha manualmente.",
    "ladderAssisted": "O agente organiza evidências verificadas de desempenho em relação às metas declaradas e prepara opções; a pessoa responsável pelo marketing revisa as evidências e aprova a decisão.",
    "ladderAutonomous": "Uma revisão programada pode sinalizar desvios das metas e preparar recomendações de campanha, mas publicação, orçamento, posicionamento e mudanças irreversíveis continuam sendo pontos de aprovação.",
    "human": "A pessoa responsável pelo marketing é dona da marca, do posicionamento, das metas, do orçamento e das decisões finais de campanha. As evidências podem ser organizadas automaticamente; o julgamento e a aprovação continuam humanos."
  },
  "Social Media Automation": {
    "replaces": "Referência de construção tradicional: 40–400 horas distribuídas entre seis perfis — desenvolvimento full-stack, gestão de produto, design UI/UX, engenharia de prompts/IA, análise de dados e QA/testes — com taxas de mercado brasileiras de R$35–90/h. A comparação documentada do Genesis usa uma faixa de economia típica de 75–90%; valide a estimativa contra o escopo real.",
    "notes": "Estabeleça primeiro a base de conhecimento da empresa, a linha de base de desempenho e as regras de publicação. O mapa atual de ferramentas marca Post for Me como obrigatória; Higgsfield, Apify, Firecrawl e Pexels são opcionais. Adicione um provedor opcional somente quando o caso de uso e suas permissões estiverem verificados.",
    "ladderManual": "Uma equipe de conteúdo pesquisa o desempenho anterior, monta cada publicação e publica plataforma por plataforma.",
    "ladderAssisted": "O fluxo transforma temas aprovados e achados de desempenho em um calendário proposto e rascunhos; uma pessoa da edição seleciona, edita e agenda o material.",
    "ladderAutonomous": "Formatos recorrentes aprovados podem avançar para uma fila de publicação pelo provedor configurado; questões de direitos, temas sensíveis, falhas de entrega e formatos novos pausam para revisão.",
    "human": "Uma pessoa responsável pela marca continua respondendo por voz, alegações factuais, direitos de uso, temas sensíveis e pela política de aprovação de publicações. A automação segue essa política; ela não cria a política."
  },
  "Bilhon Ads": {
    "replaces": "Referência de construção tradicional: 40–400 horas distribuídas entre seis perfis — desenvolvimento full-stack, gestão de produto, design UI/UX, engenharia de prompts/IA, análise de dados e QA/testes — com taxas de mercado brasileiras de R$35–90/h. A comparação documentada do Genesis usa uma faixa de economia típica de 75–90%; valide a estimativa contra o escopo real.",
    "notes": "Ancore o trabalho de criação na base de conhecimento da empresa e compare-o com dados verificados de desempenho. O mapa atual de ferramentas marca Meta Ads como obrigatória; Anthropic / Claude, Pipedrive, Shopify e HubSpot são opcionais. Conecte somente os sistemas que a operação realmente usa, defina limites de orçamento e mantenha um registro de auditoria para as mudanças propostas.",
    "ladderManual": "Uma pessoa de mídia reúne os dados das campanhas, compara os criativos e prepara manualmente cada otimização ou lançamento.",
    "ladderAssisted": "O fluxo resume os dados das campanhas e prepara propostas de criativo ou otimização; a pessoa de mídia valida as evidências e aprova as mudanças.",
    "ladderAutonomous": "O monitoramento pode destacar anomalias e preparar ações dentro de limites fixos; lançamentos, aumentos de investimento, mudanças de segmentação e alegações publicitárias continuam sendo pontos explícitos de aprovação.",
    "human": "Uma pessoa de mídia é responsável pelo investimento, pelos públicos, pelas alegações, pela segurança da marca e pela conformidade com a plataforma. Nenhuma ampliação de orçamento, mudança de segmentação ou ativação de campanha avança sem a aprovação humana configurada."
  }
};
