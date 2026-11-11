// lib/consultor/agente.ts — o cérebro do Gestor IA.
//
// Mesmo contrato de providers do lib/builder.ts (NÃO inventar outro):
//   LLM_PROVIDER explícito, senão auto — anthropic se houver chave; openai via
//   edge central (bai_builder-llm); senão MOCK determinístico (fluxo 100%
//   testável localmente sem chave).
//
// Saída estruturada nos dois providers reais: tool forçada no Anthropic e
// json_schema strict no proxy OpenAI. O modelo devolve APENAS referências
// (kind/ref/motivo) — quem materializa o card é o enrichCard do catálogo.

import type { ConsultorCatalog } from "./catalogo";
import { FASES_PLANO, type ConsultorCardKind, type ConsultorMode } from "./tipos";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY || "";
const ANTHROPIC_MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const CENTRAL_URL = process.env.CENTRAL_SUPABASE_URL || "";
const CENTRAL_SR = process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY || "";
const OPENAI_MODEL = process.env.AI_MODEL_OPENAI || "gpt-4o-mini";
const PROVIDER = (process.env.LLM_PROVIDER ||
  (ANTHROPIC_KEY ? "anthropic" : CENTRAL_URL && CENTRAL_SR ? "openai" : "mock")) as
  | "openai"
  | "anthropic"
  | "mock";

export type AgentTurn = { role: "user" | "assistant"; content: string };

/** Cenário da entrevista, só com o que o aluno disse (shape de tipos.ts). */
export type AgentCenario = {
  negocio: string;
  meta: string;
  dores: string[];
  execucao: string;
};

/** Roadmap CRU vindo do LLM (refs ainda não validadas — quem valida é a rota). */
export type AgentPlano = {
  titulo: string;
  fases: {
    nome: string;
    objetivo: string;
    itens: {
      kind: ConsultorCardKind;
      ref: string;
      motivo: string;
      didatica: string;
      resultado: string;
      primeiroPasso: string;
      esforco: string;
    }[];
  }[];
  cenario: AgentCenario | null;
};

export type AgentResult = {
  resposta: string;
  cards: { kind: ConsultorCardKind; ref: string; motivo: string; resultado: string }[];
  followup: string;
  /** só no modo planejamento, e só quando a entrevista captou os sinais */
  plano: AgentPlano | null;
};

const RESULT_SCHEMA = {
  name: "recomendacao_consultor",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      resposta: {
        type: "string",
        description:
          "Resposta consultiva curta (2-4 frases) que aterra no cenário do usuário. Sem markdown.",
      },
      cards: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["solucao", "curso", "aula", "genesis"] },
            ref: {
              type: "string",
              description:
                'ref EXATA do catálogo (id do app, slug do curso ou slug--NN da aula). Para kind genesis: sempre "genesis".',
            },
            motivo: {
              type: "string",
              description: "1-2 frases: por que ESTE item resolve o cenário descrito.",
            },
            resultado: {
              type: "string",
              description:
                "1 frase: o resultado que o aluno pode esperar, no mecanismo do item e nos números que ELE deu. Vazia se não houver afirmação honesta a fazer.",
            },
          },
          required: ["kind", "ref", "motivo", "resultado"],
        },
      },
      followup: {
        type: "string",
        description:
          "UMA pergunta de qualificação que refina a recomendação. String vazia quando não houver o que perguntar.",
      },
    },
    required: ["resposta", "cards", "followup"],
  },
} as const;

/** Item cru do roadmap — compartilhado entre o PLAN_SCHEMA e os schemas de reparo. */
const PLAN_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["solucao", "curso", "aula", "genesis"] },
    ref: { type: "string", description: 'ref EXATA do catálogo. Para kind genesis: sempre "genesis".' },
    motivo: { type: "string", description: "1-2 frases amarradas ao cenário." },
    didatica: {
      type: "string",
      description:
        "2-4 frases DIDÁTICAS: por que implementar/assistir ESTE item agora, o que ele destrava nas próximas etapas do plano e o que trava se pular. Para aula/curso: o que o aluno sai sabendo fazer e onde aplica no plano. Números só os do próprio aluno. NUNCA repita nem parafraseie o motivo: a didatica começa onde o motivo termina.",
    },
    resultado: {
      type: "string",
      description:
        "1 frase: o resultado esperado deste item nos números do próprio aluno. Vazia se não houver afirmação honesta.",
    },
    primeiroPasso: {
      type: "string",
      description:
        "O PRIMEIRO MOVIMENTO: 1 a 2 frases começando com VERBO NO IMPERATIVO, dizendo o que o aluno faz hoje pra destravar este item. Tem que citar algo concreto do cenário dele (canal, ferramenta, número, quem executa). PROIBIDO texto genérico do tipo 'abra pelo link e siga o passo a passo': isso vale pra qualquer item e não ajuda ninguém.",
    },
    esforco: {
      type: "string",
      description: 'Estimativa honesta ("3-5 dias de setup" · "4-6h de estudo").',
    },
  },
  required: ["kind", "ref", "motivo", "didatica", "resultado", "primeiroPasso", "esforco"],
} as const;

const PLAN_SCHEMA = {
  name: "turno_planejamento",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      resposta: {
        type: "string",
        description:
          "Fala do consultor neste turno (2-5 frases). Na entrega do plano: o racional + por onde começar.",
      },
      followup: {
        type: "string",
        description:
          "A pergunta da entrevista deste turno (vazia quando o plano for entregue).",
      },
      plano: {
        type: "object",
        additionalProperties: false,
        description:
          "O roadmap. pronto=false enquanto a entrevista não captou os sinais (aí fases fica vazio).",
        properties: {
          pronto: { type: "boolean" },
          titulo: {
            type: "string",
            description: 'Título específico do plano (ex.: "Roadmap de IA pra Clínica de Estética").',
          },
          cenario: {
            type: "object",
            additionalProperties: false,
            description:
              "O cenário captado na entrevista, SÓ com o que o aluno disse (frases curtas, números dele). Preencher junto com o plano pronto; strings vazias e lista vazia enquanto pronto=false.",
            properties: {
              negocio: { type: "string", description: "O negócio e o momento, em 1 frase curta." },
              meta: { type: "string", description: "O objetivo do próximo capítulo, nos números do aluno." },
              dores: {
                type: "array",
                maxItems: 3,
                items: { type: "string" },
                description: "As dores que sangram hoje, cada uma com o número que o aluno deu.",
              },
              execucao: { type: "string", description: "Quem implementa e quanto tempo tem." },
            },
            required: ["negocio", "meta", "dores", "execucao"],
          },
          fases: {
            type: "array",
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                nome: { type: "string", enum: [...FASES_PLANO] },
                objetivo: {
                  type: "string",
                  description: "Uma frase: o que esta fase resolve NESTE cenário.",
                },
                itens: { type: "array", minItems: 1, maxItems: 3, items: PLAN_ITEM_SCHEMA },
              },
              required: ["nome", "objetivo", "itens"],
            },
          },
        },
        required: ["pronto", "titulo", "cenario", "fases"],
      },
    },
    required: ["resposta", "followup", "plano"],
  },
} as const;

/** Schema do retry cirúrgico: só as fases que ficaram vazias após o enriquecimento. */
function refillSchema(fasesVazias: string[]) {
  return {
    name: "preencher_fases_vazias",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        fases: {
          type: "array",
          minItems: 1,
          maxItems: fasesVazias.length,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              nome: { type: "string", enum: fasesVazias },
              objetivo: {
                type: "string",
                description: "Uma frase: o que esta fase resolve NESTE cenário.",
              },
              itens: { type: "array", minItems: 1, maxItems: 3, items: PLAN_ITEM_SCHEMA },
            },
            required: ["nome", "objetivo", "itens"],
          },
        },
      },
      required: ["fases"],
    },
  };
}

/** Schema da regeneração de UMA fase a pedido do aluno. */
const REGEN_SCHEMA = {
  name: "nova_versao_fase",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      objetivo: {
        type: "string",
        description: "Uma frase: o que esta fase resolve NESTE cenário.",
      },
      itens: { type: "array", minItems: 1, maxItems: 3, items: PLAN_ITEM_SCHEMA },
    },
    required: ["objetivo", "itens"],
  },
} as const;

function systemPrompt(catalogText: string, firstName: string): string {
  return [
    "# QUEM VOCÊ É",
    "Você é o Gestor IA da Arkom — o consultor sênior que conhece o ecossistema inteiro: as",
    "soluções de IA prontas (com seus módulos, ferramentas e nível de autonomia), as capacitações e",
    "cada aula. Sua missão é pegar o cenário que o aluno traz — negócio, dor, ferramenta, dúvida —",
    "e devolver O caminho: qual solução usar, qual aula assistir, em que ordem, e por quê.",
    `O aluno se chama ${firstName}. Português brasileiro, tom de consultor experiente: direto,`,
    "próximo, específico. Zero jargão vazio, zero resposta de manual.",
    "",
    "# MÉTODO SPIN (siga nesta ordem, a cada turno)",
    "O fio da conversa é SPIN: Situação → Problema → Implicação → Necessidade. Ele guia o seu",
    "diagnóstico e a sua pergunta de cada turno, sem virar interrogatório: a recomendação não",
    "espera o SPIN completo, ela refina a cada resposta do aluno.",
    "1. SITUAÇÃO E PROBLEMA — identifique a frente do negócio onde a dor mora, usando o MAPA ARKOM",
    "   como vocabulário (Back Office, Clientes, Produto, Marketing, Negócios, Inteligência). A dor",
    "   que o aluno descreve nem sempre é a dor raiz: atendimento lotado pode ser problema de",
    "   qualificação; 'não tenho tempo' costuma ser processo manual sem dono.",
    "2. IMPLICAÇÃO — torne explícito o que a dor custa, SEMPRE com os números que o ALUNO deu",
    "   (leads que esfriam, horas do time, no-shows, clientes que não voltam). Se ele disse '30",
    "   leads por dia e 4 horas pra responder', a implicação é dele, não sua: leads esfriando 4",
    "   horas por dia, todos os dias. Sem números dele, a implicação é qualitativa e curta.",
    "   NUNCA invente estatística, benchmark de mercado ou caso de outro cliente.",
    "3. CAMINHO — escolha no CATÁLOGO RECOMENDÁVEL o menor conjunto de itens que destrava o cenário:",
    "   · dor operacional AGORA → solução pronta (app) que resolve direto;",
    "   · autonomia para customizar/adaptar → a capacitação ou aula certa (não o curso inteiro se",
    "     uma aula específica resolve);",
    "   · combo clássico: a solução que apaga o incêndio + a aula que dá autonomia técnica sobre",
    "     ela (ex.: plataforma de atendimento + curso da ferramenta em que ela roda);",
    "   · nada no catálogo cobre o núcleo da dor → GENESIS (seção própria abaixo).",
    "4. ORDEM — se recomendar mais de um item, deixe explícito por onde começar e o que fica pra",
    "   depois. Recomendação sem ordem é lista, não consultoria.",
    "5. QUALIFICAÇÃO SPIN — feche com UMA pergunta (followup): o degrau do SPIN que ainda falta,",
    "   escolhido pelo que você já sabe da conversa:",
    "   · só conhece a situação → pergunta de PROBLEMA (onde trava, o que mais dói);",
    "   · já conhece o problema → pergunta de IMPLICAÇÃO que torna o custo concreto (quanto custa",
    "     por mês, quantos leads morrem na fila, quantas horas o time gasta nisso);",
    "   · custo já está claro → pergunta de NECESSIDADE que faz o ALUNO dizer o valor da solução",
    "     ('o que muda no teu caixa se cada lead for respondido em 1 minuto?').",
    "   Pergunta que não muda a próxima recomendação não vale ser feita — nesse caso, followup",
    "   vazio.",
    "",
    "# COMO ESCREVER",
    "· `resposta` (2-4 frases; até 6 quando recomendar o Genesis, porque a orientação da",
    "  entrevista faz parte dela): valida a dor com as PALAVRAS DO CENÁRIO do aluno, nomeia a",
    "  frente do problema e anuncia o caminho. Os detalhes de produto ficam nos cards, não aqui.",
    "· `motivo` de cada card (1-2 frases): a ponte entre O CENÁRIO DELE e o item. Cite o elemento",
    "  concreto que ele mencionou (canal, volume, time, ferramenta).",
    "  RUIM: 'Plataforma completa de atendimento com IA.' (descrição genérica)",
    "  BOM: 'Centraliza o WhatsApp da sua agência e responde o repetitivo com IA: seu time para",
    "  de virar fila de suporte e volta a entregar resultado pros clientes.'",
    "· O motivo descreve o item da ref indicada, NUNCA outro item do catálogo. Motivo que fala de",
    "  CRM num card de social media é defeito grave: releia o card antes de entregar.",
    "· `resultado` de cada card (1 frase): o que ESTE aluno pode esperar quando o item estiver",
    "  rodando, sempre pelo mecanismo do item e nos números DELE. BOM: 'Os 30 leads por dia que",
    "  hoje esperam 4 horas passam a ser respondidos em segundos, inclusive de madrugada.'",
    "  Projeção numérica só como aritmética dos números que ELE deu, nomeada como estimativa",
    "  ('se metade dos 10 no-shows da semana confirmar, são 5 atendimentos recuperados').",
    "  PROIBIDO: estatística inventada, percentual de melhora sem fonte, caso de outro cliente,",
    "  benchmark de mercado. Sem afirmação honesta a fazer: resultado vazio, sem constrangimento.",
    "· Sem markdown, sem listas, sem emoji. Prosa de conversa.",
    "· NUNCA use travessão ou hífen como pontuação (nem o caractere — nem \" - \" entre espaços).",
    "  Estruture com vírgula, dois-pontos ou ponto final. Hífen só dentro de palavra composta",
    "  (no-show, pré-venda, follow-up) e em faixas numéricas coladas (3-5 dias).",
    "",
    "# GENESIS (a solução que não existe, o aluno constrói)",
    "O Genesis é a fábrica de projetos da Arkom, dentro da plataforma, na página /genesis. Como",
    "funciona: o aluno passa por uma entrevista guiada sobre o negócio e o processo (perguntas uma",
    "a uma, com opção de ditar por voz) e o Genesis transforma as respostas num projeto completo",
    "em 8 etapas: Base de Conhecimento, Framework, Arquitetura e Fluxos, Ferramentas, Plano de",
    "Ação em 3 sprints, Prompt Lovable, Conteúdos e Economia. Não é uma caixa de prompt: o que",
    "define a solução é o projeto que sai da entrevista. A etapa Prompt Lovable entrega o prompt",
    "do MVP pronto para colar no Lovable, e a etapa Conteúdos aponta as aulas da plataforma que",
    "sustentam cada sprint. Quem constrói é o ALUNO, usando o projeto como guia.",
    "NUNCA diga que a Arkom executa, constrói ou hospeda a aplicação pelo aluno, nem prometa botão",
    "de execução, banco de dados, infraestrutura ou hospedagem inclusos: isso não existe.",
    "QUANDO recomendar: a dor é real e específica do negócio e nenhum item do CATÁLOGO",
    "RECOMENDÁVEL cobre o núcleo dela; ou o que existe cobre só a borda e o processo central do",
    "aluno continua manual. Catálogo primeiro, sempre: Genesis é a saída certa quando a resposta",
    "honesta seria 'não temos isso pronto', não o caminho default.",
    "COMO recomendar: card com kind genesis e ref genesis. O motivo descreve a solução A",
    "CONSTRUIR pro cenário dele ('um painel que junta as propostas do teu CRM com a agenda dos",
    "técnicos'), não o Genesis em si.",
    "OBRIGATÓRIO sempre que houver card genesis: a resposta TERMINA instruindo o aluno a chegar",
    "na entrevista do Genesis com 4 coisas claras, amarradas ao cenário DELE: o processo que a",
    "solução cobre (passo a passo de como é feito hoje), quem vai usar no dia a dia, os dados e",
    "sistemas envolvidos, e o resultado esperado. Exemplo de fecho: 'Antes de abrir o Genesis,",
    "deixa na ponta da língua como as rotas são montadas hoje, quem vai operar o sistema, onde",
    "vive a quilometragem de cada caminhão e qual resultado você espera. Entrevista bem",
    "alimentada sai um planejamento certeiro.' Card genesis sem essa instrução na resposta é",
    "entrega incompleta.",
    "Solução do MAPA marcada como em breve: diga que ela chega na plataforma; se a dor não pode",
    "esperar, o Genesis monta agora o projeto de uma versão sob medida.",
    "",
    "# REGRAS DURAS",
    "1. Cards SEMPRE com ref exata do CATÁLOGO RECOMENDÁVEL (ou o card genesis, nas condições da",
    "   seção GENESIS). O MAPA ARKOM é conhecimento de contexto (o que cada solução faz por",
    "   dentro, módulos, ferramentas) — use para explicar e diagnosticar, mas itens do mapa que",
    "   não estão no catálogo NÃO viram card; se o assunto surgir, diga que essa solução chega na",
    "   plataforma em breve.",
    "2. 1 a 3 cards por resposta. Menos e certeiro > mais e raso.",
    "3. Não repita card já recomendado nesta conversa (a menos que o aluno peça).",
    "4. [EM BREVE] / [AINDA NÃO LIBERADO] não é caminho imediato — só cite se perguntarem, com o",
    "   status honesto.",
    "5. Aula [aluno JÁ CONCLUIU] é bagagem: reconheça e aponte o PRÓXIMO passo, nunca a mesma aula.",
    "6. Nada no catálogo resolve? Diga com todas as letras e aponte o Genesis como caminho de",
    "   construção (card genesis), instruindo o que levar pra entrevista. Recomendação forçada de",
    "   item que não encaixa queima a confiança de todas as próximas.",
    "7. Perguntas fora do escopo (não relacionadas a negócio/IA/plataforma): redirecione com",
    "   gentileza para o que você sabe fazer.",
    "",
    catalogText,
  ].join("\n");
}

function planejamentoPrompt(catalogText: string, firstName: string): string {
  return [
    "# QUEM VOCÊ É",
    "Você é o Gestor IA da Arkom no MODO PLANEJAMENTO ESTRATÉGICO: uma conversa curta de",
    "diagnóstico que termina num roadmap completo em 4 fases, montado só com itens do catálogo.",
    "O entregável tem nome de produto: Cronograma de IAtização. Quando falar do plano com o",
    "aluno, chame de Cronograma de IAtização (ou 'seu Cronograma'), nunca de 'planejamento'.",
    `O aluno se chama ${firstName}. Português brasileiro, tom de consultor sênior: direto, próximo.`,
    "Sem formulário — só conversa.",
    "",
    "# ENTREVISTA (antes do plano) — conduzida em SPIN",
    "A entrevista segue SPIN: Situação → Problema → Implicação → Necessidade. Você precisa captar",
    "estes SINAIS antes de montar qualquer coisa:",
    "1. SITUAÇÃO: o negócio e o contexto (o que é, tamanho, como opera hoje);",
    "2. PROBLEMA: a dor principal (a que sangra receita ou trava o crescimento agora);",
    "3. IMPLICAÇÃO: o que a dor custa hoje, nos números do próprio aluno (receita que escapa,",
    "   horas do time, leads que morrem, no-shows). Um número dele vale mais que dez adjetivos:",
    "   é ele que deixa o plano e os resultados concretos;",
    "4. NECESSIDADE: o objetivo do próximo capítulo (número ou marco, com prazo se houver), dito",
    "   pelo aluno como valor ('o que muda pra você quando isso estiver resolvido?');",
    "5. O que já tentaram + ferramentas que já usam;",
    "6. Quem implementa e quanto tempo tem (define a fricção aceitável dos itens).",
    "Regras da entrevista:",
    "· UMA frente por turno (no máximo duas perguntas curtas e conexas). Interrogatório mata a",
    "  conversa. O SPIN dá a ordem natural das perguntas, não uma pergunta a mais.",
    "· Reaja ao que o aluno disse antes de perguntar — mostre que entendeu a dor com as palavras",
    "  dele. Quando ele der um número, devolva a implicação com o número ('4 horas de espera com",
    "  30 leads por dia é lead esfriando o dia inteiro') antes da próxima pergunta.",
    "· 2 a 4 turnos costumam bastar. Sinais suficientes > checklist completo. A implicação em",
    "  números vale um turno dedicado; os demais sinais costumam vir juntos.",
    "· NUNCA invente estatística, benchmark ou caso de outro cliente pra dar peso à implicação:",
    "  os números são os que o aluno deu.",
    "· Enquanto entrevista: plano.pronto=false, fases=[], followup = a pergunta do turno.",
    "· Avise quando for a última pergunta ('última coisa antes de eu montar').",
    "",
    "# O PLANO (quando os sinais estiverem captados)",
    "plano.pronto=true, com EXATAMENTE 4 fases, nesta ordem e com estes nomes fixos:",
    `· "${FASES_PLANO[0]}" — estanca a dor que sangra AGORA; itens que o próprio aluno coloca de`,
    "  pé em dias, respeitando quem implementa e o tempo disponível;",
    `· "${FASES_PLANO[1]}" — estrutura processo e base (dados, CRM, capacitação de fundamento);`,
    `· "${FASES_PLANO[2]}" — cresce sobre a fundação (escala, novos canais, aprofundamento);`,
    `· "${FASES_PLANO[3]}" — inteligência, dados e visão de longo prazo.`,
    "Cada fase: objetivo de UMA frase amarrada ao cenário + 1-3 itens. Cada item: ref EXATA do",
    "CATÁLOGO RECOMENDÁVEL (nunca inventar), motivo específico ao cenário (não descrição genérica),",
    "didatica (o CORAÇÃO do material: 2-4 frases de professor explicando por que implementar ou",
    "assistir ESTE item AGORA, o que ele destrava nas fases seguintes, o que continua travado se",
    "pular, e como se encadeia com a meta do aluno; para aula/curso, diga o que ele sai sabendo",
    "FAZER e em qual item do plano aplica; números só os do próprio aluno; NUNCA repita nem",
    "parafraseie o motivo: a didatica começa onde o motivo termina),",
    "resultado esperado (1 frase, pelo mecanismo do item e nos números que o ALUNO deu na",
    "entrevista; projeção só como aritmética dos números dele, nomeada como estimativa; NUNCA",
    "estatística inventada nem caso de outro cliente; vazio se não houver afirmação honesta),",
    "primeiroPasso (o PRIMEIRO MOVIMENTO: 1 a 2 frases começando com VERBO NO IMPERATIVO com o",
    "que ele faz HOJE pra destravar o item, citando algo concreto do cenário dele: o canal, a",
    "ferramenta que já usa, o número que deu, quem executa. Nada de 'abra pelo link e siga o",
    "passo a passo', que serve pra qualquer item e não ensina nada. Para aula/curso: o que",
    "assistir primeiro e o que ter aberto do lado pra aplicar enquanto assiste. Para genesis:",
    "o que levar pronto pra entrevista)",
    "e esforco honesto ('3-5 dias de setup', '4-6h de estudo').",
    "As 4 fases são OBRIGATÓRIAS, cada uma com pelo menos 1 item VÁLIDO. Antes de entregar,",
    "confira ref por ref contra o CATÁLOGO RECOMENDÁVEL: ref que não existe é descartada pelo",
    "sistema e a fase chega VAZIA pro aluno. Não existe o item perfeito pra uma fase? Preencha",
    "com o que EXISTE no catálogo e mais avança o cenário nela (o motivo explica o encaixe);",
    "jamais com uma ref inventada.",
    "O motivo de cada item descreve ESTE item (cite o nome dele ou a função que ele executa),",
    "nunca outro produto do catálogo.",
    "Combine tipos: solução que resolve + aula/curso que dá autonomia sobre ela.",
    "A resposta que acompanha o plano: valida o racional em 3-5 frases fechando o SPIN, retome o",
    "custo da dor que o aluno deu (implicação) e o que muda quando as primeiras fases estiverem",
    "de pé (necessidade, nos números dele), nomeia por onde começar (fase 1) e avisa que o",
    "Cronograma está pronto e pode ser aberto no card logo abaixo desta mensagem, em tela cheia",
    "ou em PDF. followup vazio.",
    "titulo: específico do cenário ('Cronograma de IAtização pra <negócio>').",
    "cenario (junto com o plano pronto): o retrato da entrevista em 4 campos curtos, SÓ com o que",
    "o aluno disse e os números DELE: negocio (1 frase), meta (o objetivo com número/prazo),",
    "dores (1 a 3, cada uma com o número que ele deu) e execucao (quem implementa, quanto tempo).",
    "Nada de adjetivo seu nem estimativa sua aqui: é o espelho fiel do que ele contou.",
    "",
    "# GENESIS (a solução que não existe, o aluno constrói)",
    "O Genesis é a fábrica de projetos da Arkom, na página /genesis: entrevista guiada sobre o",
    "processo e projeto completo em 8 etapas (Base de Conhecimento, Framework, Arquitetura e",
    "Fluxos, Ferramentas, Plano de Ação em 3 sprints, Prompt Lovable, Conteúdos e Economia). Não é",
    "caixa de prompt: o que define a solução é o projeto que sai da entrevista, e a etapa Prompt",
    "Lovable entrega o prompt do MVP pronto para colar no Lovable. Quem constrói é o ALUNO, com o",
    "projeto como guia. NUNCA prometa que a Arkom executa, constrói ou hospeda a aplicação por ele.",
    "No roadmap: quando o cenário pede uma solução específica que NENHUM item do catálogo cobre,",
    "inclua um item com kind genesis e ref genesis, no MÁXIMO UM no plano inteiro, na fase em que",
    "construir a solução própria destrava o cenário (raramente na fase 1: quick wins vêm do",
    "catálogo). O motivo descreve a solução A CONSTRUIR pro cenário do aluno, não o Genesis. O",
    "resultado segue a mesma regra dos outros itens. O esforco é honesto e separa as duas partes:",
    "a entrevista leva menos de uma hora e a construção é do aluno ('entrevista de 30-60 min +",
    "construção do MVP no Lovable').",
    "Catálogo primeiro, sempre: Genesis não substitui item que já existe.",
    "",
    "# REGRAS DURAS",
    "1. Nunca gere o plano no primeiro turno, mesmo que o aluno já conte bastante — confirme pelo",
    "   menos o que já tentaram e quem implementa.",
    "2. Refs só do CATÁLOGO RECOMENDÁVEL (ou o item genesis, nas condições da seção GENESIS).",
    "   O MAPA ARKOM é contexto para diagnosticar e explicar.",
    "3. Itens [EM BREVE]/[AINDA NÃO LIBERADO] não entram no plano.",
    "4. Aula [aluno JÁ CONCLUIU] é bagagem — conte com ela, não a recomende de novo.",
    "5. Sem markdown, sem listas na resposta. Prosa de conversa.",
    "6. NUNCA use travessão ou hífen como pontuação (nem o caractere — nem \" - \" entre espaços).",
    "   Estruture com vírgula, dois-pontos ou ponto final. Hífen só dentro de palavra composta",
    "   (no-show, pré-venda) e em faixas numéricas coladas (3-5 dias).",
    "",
    catalogText,
  ].join("\n");
}

type ProviderError = Error & { retryAfterMs?: number };

/**
 * Remove travessões/hífens usados como PONTUAÇÃO nos textos do modelo
 * (diretriz da marca: sem "—" nas falas do Gestor). Hífen dentro de
 * palavra composta ("no-show", "pré-venda") e em faixas coladas ("3-5 dias")
 * é preservado — só cai o hífen solto entre espaços e os travessões.
 * Exportada: as rotas usam ao promover texto de catálogo a fala do Gestor.
 */
export function semTravessao(t: string): string {
  return t
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extrai o objeto JSON de uma resposta em texto (tolera prosa e cercas). */
function extractJson<T>(text: string): T {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("sem JSON na resposta");
  return JSON.parse(t.slice(start, end + 1)) as T;
}

/** Contrato de tool forçada — RESULT_SCHEMA (consultor) ou PLAN_SCHEMA (planejamento). */
type ToolSpec = { name: string; schema: unknown };

async function callAnthropic(system: string, history: AgentTurn[], tool: ToolSpec): Promise<unknown> {
  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    // o catálogo é grande e idêntico entre mensagens da mesma conversa — cacheia
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    tools: [
      {
        name: tool.name,
        description: "Registra a resposta estruturada do Gestor.",
        input_schema: tool.schema,
      },
    ],
    tool_choice: { type: "tool", name: tool.name },
  };
  // tool_choice forçada é incompatível com thinking (mesma regra do builder.ts);
  // nos modelos fable/mythos o thinking é sempre ativo — omite o parâmetro.
  if (!/fable|mythos/i.test(ANTHROPIC_MODEL)) body.thinking = { type: "disabled" };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err: ProviderError = new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterMs = retryAfter * 1000;
    throw err;
  }
  const json = (await res.json()) as { content?: { type?: string; text?: string; input?: unknown }[] };
  const toolUse = (json.content ?? []).find((c) => c.type === "tool_use");
  if (toolUse && toolUse.input !== undefined) return toolUse.input;
  const text = (json.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
  return extractJson(text);
}

/** OpenAI via edge do central (proxy bai_builder-llm) — a conversa vai serializada
 *  no user prompt (o proxy é single-turn). */
async function callOpenAI(system: string, history: AgentTurn[], tool: ToolSpec): Promise<unknown> {
  const user =
    "CONVERSA ATÉ AQUI:\n" +
    history.map((m) => `${m.role === "user" ? "ALUNO" : "CONSULTOR"}: ${m.content}`).join("\n") +
    "\n\nResponda ao último turno do ALUNO.";
  const res = await fetch(`${CENTRAL_URL}/functions/v1/bai_builder-llm`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CENTRAL_SR, authorization: `Bearer ${CENTRAL_SR}` },
    body: JSON.stringify({
      system: system + "\n\nResponda APENAS com um objeto JSON válido.",
      user,
      max_tokens: 4000,
      model: OPENAI_MODEL,
      schema_name: tool.name,
      schema: tool.schema,
    }),
  });
  const j = (await res.json()) as { text?: string; model?: string; error?: string };
  if (!res.ok || j.error) throw new Error(`central-openai ${res.status}: ${j.error ?? ""}`);
  return extractJson(j.text ?? "");
}

/** Mock determinístico: recomenda os primeiros itens reais do catálogo — o fluxo
 *  inteiro (persistência, cards, jornada, UI) roda sem chave nenhuma. */
function mockResult(catalog: ConsultorCatalog, history: AgentTurn[]): AgentResult {
  const jaFalou = history.filter((m) => m.role === "assistant").length;
  const app = [...catalog.apps.values()].find((a) => a.available);
  const aula = [...catalog.aulas.keys()][0];
  const cards: AgentResult["cards"] = [];
  if (app) {
    cards.push({
      kind: "solucao",
      ref: String(app.id),
      motivo: `Pelo cenário que você descreveu, ${app.name} é o caminho mais direto (mock, configure ANTHROPIC_API_KEY para recomendações reais).`,
      resultado: "O processo manual que você descreveu passa a rodar sozinho (mock).",
    });
  }
  if (aula && jaFalou === 0) {
    cards.push({
      kind: "aula",
      ref: aula,
      motivo: "Esta aula te dá a base pra implementar sem depender de ninguém (mock).",
      resultado: "",
    });
  }
  return {
    resposta:
      jaFalou === 0
        ? "Entendi o seu cenário. Esse tipo de operação manual é exatamente o que dá pra resolver com o que já existe no catálogo. Separei o caminho mais direto pra você começar."
        : "Boa. Com essa resposta dá pra fechar o caminho: começa pelo item abaixo e me diga quando estiver rodando.",
    cards,
    followup: jaFalou === 0 ? "Qual dessas frentes dói mais no seu dia a dia hoje?" : "",
    plano: null,
  };
}

/** Mock do planejamento: 1 turno de entrevista, depois um roadmap com itens reais. */
function mockPlanoResult(catalog: ConsultorCatalog, history: AgentTurn[]): AgentResult {
  const turnosUsuario = history.filter((m) => m.role === "user").length;
  if (turnosUsuario < 2) {
    return {
      resposta:
        "Entendi o cenário (mock, configure ANTHROPIC_API_KEY para o planejamento real). Última coisa antes de eu montar: o que vocês já tentaram e quem vai tocar a implementação?",
      cards: [],
      followup: "O que já tentaram e quem implementa?",
      plano: null,
    };
  }
  const apps = [...catalog.apps.values()].filter((a) => a.available).slice(0, 4);
  const aula = [...catalog.aulas.keys()][0];
  const item = (i: number, motivo: string) =>
    apps[i]
      ? [{
          kind: "solucao" as const,
          ref: String(apps[i].id),
          motivo,
          didatica: "Implementar agora destrava as fases seguintes do plano (mock).",
          primeiroPasso: "Abra a solucao e conecte o canal onde a dor aparece (mock).",
          resultado: "A dor descrita nesta etapa deixa de depender de trabalho manual (mock).",
          esforco: "3-5 dias de setup",
        }]
      : [];
  return {
    resposta:
      "Pronto, teu roadmap tá montado aqui ao lado (mock). Começa pela fase 1, são os quick wins pra essa semana.",
    cards: [],
    followup: "",
    plano: {
      titulo: "Roadmap de IA (mock)",
      cenario: {
        negocio: "Negócio descrito na entrevista (mock).",
        meta: "Meta informada pelo aluno (mock).",
        dores: ["Dor principal com o número do aluno (mock)."],
        execucao: "Quem implementa e o tempo disponível (mock).",
      },
      fases: [
        {
          nome: FASES_PLANO[0],
          objetivo: "Estancar a dor principal descrita no cenário.",
          itens: [
            ...item(0, "Ataca a dor imediata do cenário descrito (mock)."),
            ...(aula
              ? [{ kind: "aula" as const, ref: aula, motivo: "Base pra implementar sozinho (mock).", didatica: "Assistindo antes, você implementa o resto do plano sem depender de ninguém (mock).", resultado: "", primeiroPasso: "Assista a primeira aula com a plataforma aberta do lado (mock).", esforco: "1-2h de estudo" }]
              : []),
          ],
        },
        { nome: FASES_PLANO[1], objetivo: "Estruturar a base da operação.", itens: item(1, "Estrutura o processo (mock).") },
        { nome: FASES_PLANO[2], objetivo: "Escalar sobre a fundação.", itens: item(2, "Escala a operação (mock).") },
        { nome: FASES_PLANO[3], objetivo: "Inteligência e visão de longo prazo.", itens: item(3, "Visão de dados (mock).") },
      ],
    },
  };
}

/** Valida/normaliza o shape vindo do LLM (nunca confiar no parse cru). */
function normalize(raw: unknown): AgentResult {
  const obj = (raw ?? {}) as Partial<AgentResult> & { cards?: unknown; plano?: unknown };
  const cards = Array.isArray(obj.cards)
    ? obj.cards
        .filter(
          (c): c is AgentResult["cards"][number] =>
            !!c &&
            typeof c === "object" &&
            ["solucao", "curso", "aula", "genesis"].includes((c as { kind?: string }).kind ?? "") &&
            typeof (c as { ref?: unknown }).ref === "string"
        )
        .slice(0, 3)
        .map((c) => ({
          kind: c.kind,
          ref: c.ref,
          motivo: typeof c.motivo === "string" ? semTravessao(c.motivo) : "",
          resultado: typeof c.resultado === "string" ? semTravessao(c.resultado).slice(0, 500) : "",
        }))
    : [];
  return {
    resposta: typeof obj.resposta === "string" ? semTravessao(obj.resposta) : "",
    cards,
    followup: typeof obj.followup === "string" ? semTravessao(obj.followup) : "",
    plano: normalizePlano(obj.plano),
  };
}

type PlanoItemCru = AgentPlano["fases"][number]["itens"][number];

/** Itens crus do LLM → shape validado (refs seguem cruas; quem valida é o enriquecimento). */
function normalizeItens(raw: unknown): PlanoItemCru[] {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (i): i is {
        kind: ConsultorCardKind;
        ref: string;
        motivo?: string;
        didatica?: string;
        resultado?: string;
        primeiroPasso?: string;
        esforco?: string;
      } =>
        !!i &&
        typeof i === "object" &&
        ["solucao", "curso", "aula", "genesis"].includes((i as { kind?: string }).kind ?? "") &&
        typeof (i as { ref?: unknown }).ref === "string"
    )
    .slice(0, 3)
    .map((i) => ({
      kind: i.kind,
      ref: i.ref,
      motivo: typeof i.motivo === "string" ? semTravessao(i.motivo) : "",
      didatica: typeof i.didatica === "string" ? semTravessao(i.didatica).slice(0, 700) : "",
      resultado: typeof i.resultado === "string" ? semTravessao(i.resultado).slice(0, 500) : "",
      primeiroPasso:
        typeof i.primeiroPasso === "string" ? semTravessao(i.primeiroPasso).slice(0, 400) : "",
      esforco: typeof i.esforco === "string" ? semTravessao(i.esforco) : "",
    }));
}

/** Cenário cru → shape validado (null quando vazio/inválido). */
function normalizeCenario(raw: unknown): AgentCenario | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as { negocio?: unknown; meta?: unknown; dores?: unknown; execucao?: unknown };
  const campo = (v: unknown) => (typeof v === "string" ? semTravessao(v).slice(0, 240) : "");
  const cenario: AgentCenario = {
    negocio: campo(c.negocio),
    meta: campo(c.meta),
    dores: (Array.isArray(c.dores) ? c.dores : [])
      .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
      .slice(0, 3)
      .map((d) => semTravessao(d).slice(0, 240)),
    execucao: campo(c.execucao),
  };
  // cenário sem substância não vai pra tela
  if (!cenario.negocio && !cenario.meta && !cenario.dores.length && !cenario.execucao) return null;
  return cenario;
}

/**
 * Plano cru → AgentPlano validado (null enquanto pronto=false ou shape inválido).
 * Fase sem item válido SOBREVIVE aqui de propósito: a rota usa a lista de fases
 * vazias pra disparar o retry cirúrgico e a redistribuição (4 fases sempre).
 */
function normalizePlano(raw: unknown): AgentPlano | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as { pronto?: unknown; titulo?: unknown; cenario?: unknown; fases?: unknown };
  if (p.pronto !== true || !Array.isArray(p.fases) || p.fases.length === 0) return null;
  const fases = p.fases
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      nome: typeof f.nome === "string" ? f.nome : "",
      objetivo: typeof f.objetivo === "string" ? semTravessao(f.objetivo) : "",
      itens: normalizeItens(f.itens),
    }))
    .slice(0, 4);
  if (!fases.length) return null;
  return {
    titulo:
      typeof p.titulo === "string" && p.titulo.trim() ? semTravessao(p.titulo) : "Roadmap de IA",
    fases,
    cenario: normalizeCenario(p.cenario),
  };
}

/**
 * Roda um turno do Gestor. `history` já inclui a última mensagem do usuário.
 * Retenta com backoff (respeita retry-after) e LANÇA se o provider real falhar
 * todas as tentativas — mock nunca é persistido como conteúdo real.
 */
export async function runConsultor(opts: {
  catalog: ConsultorCatalog;
  history: AgentTurn[];
  firstName: string;
  mode?: ConsultorMode;
}): Promise<AgentResult> {
  const mode: ConsultorMode = opts.mode ?? "consultor";
  if (PROVIDER === "mock") {
    return mode === "planejamento"
      ? mockPlanoResult(opts.catalog, opts.history)
      : mockResult(opts.catalog, opts.history);
  }

  const system =
    mode === "planejamento"
      ? planejamentoPrompt(opts.catalog.promptText, opts.firstName)
      : systemPrompt(opts.catalog.promptText, opts.firstName);
  const tool: ToolSpec = mode === "planejamento" ? PLAN_SCHEMA : RESULT_SCHEMA;
  let lastErr: unknown;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const raw =
        PROVIDER === "openai"
          ? await callOpenAI(system, opts.history, tool)
          : await callAnthropic(system, opts.history, tool);
      const result = normalize(raw);
      if (!result.resposta && !result.cards.length && !result.plano) {
        throw new Error("resposta vazia do LLM");
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (tentativa < 3) {
        const hint = (err as ProviderError).retryAfterMs;
        await new Promise((resolve) => setTimeout(resolve, Math.min(hint ?? 1500 * tentativa, 30_000)));
      }
    }
  }
  throw new Error(`Gestor falhou após 3 tentativas: ${(lastErr as Error)?.message}`);
}

/* ── Reparos do roadmap (retry cirúrgico + regeneração de fase) ───────────── */

/** Uma fase devolvida pelos reparos: nome fixo + objetivo + itens crus. */
export type FaseItens = { nome: string; objetivo: string; itens: PlanoItemCru[] };

/** Anthropic exige papéis alternados — funde turnos consecutivos do mesmo papel. */
function coalesce(history: AgentTurn[]): AgentTurn[] {
  const out: AgentTurn[] = [];
  for (const turn of history) {
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else {
      out.push({ ...turn });
    }
  }
  return out;
}

/** Chamada crua ao provider com retry curto — usada só pelos reparos do plano. */
async function callLLM(system: string, history: AgentTurn[], tool: ToolSpec): Promise<unknown> {
  let lastErr: unknown;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      return PROVIDER === "openai"
        ? await callOpenAI(system, history, tool)
        : await callAnthropic(system, history, tool);
    } catch (err) {
      lastErr = err;
      if (tentativa < 2) {
        const hint = (err as ProviderError).retryAfterMs;
        await new Promise((resolve) => setTimeout(resolve, Math.min(hint ?? 1500, 30_000)));
      }
    }
  }
  throw lastErr;
}

/** Itens mock (apps reais disponíveis, fora das refs excluídas) para os reparos. */
function mockItens(catalog: ConsultorCatalog, exclui: Set<string>, quantos: number): PlanoItemCru[] {
  return [...catalog.apps.values()]
    .filter((a) => a.available && !exclui.has(`solucao:${a.id}`))
    .slice(0, quantos)
    .map((a) => ({
      kind: "solucao" as const,
      ref: String(a.id),
      motivo: `${a.name} cobre esta etapa do cenário descrito (mock).`,
      didatica: "",
      resultado: "",
      primeiroPasso: "",
      esforco: "3-5 dias de setup",
    }));
}

/**
 * Retry cirúrgico: pede ao modelo pra preencher SÓ as fases que ficaram vazias
 * depois do enriquecimento (refs inválidas descartadas), sem repetir as refs
 * que sobreviveram no resto do plano. Mesmo system prompt do turno (cache hit).
 */
export async function runPreencherFases(opts: {
  catalog: ConsultorCatalog;
  history: AgentTurn[];
  firstName: string;
  fasesVazias: string[];
  refsUsadas: string[];
}): Promise<FaseItens[]> {
  if (!opts.fasesVazias.length) return [];
  if (PROVIDER === "mock") {
    const exclui = new Set(opts.refsUsadas);
    return opts.fasesVazias.map((nome) => {
      const itens = mockItens(opts.catalog, exclui, 1);
      for (const i of itens) exclui.add(`${i.kind}:${i.ref}`);
      return { nome, objetivo: "Avançar o cenário nesta etapa (mock).", itens };
    });
  }

  const pedido = [
    "[SISTEMA] O roadmap que você entregou tinha refs fora do catálogo e estas fases ficaram",
    `sem nenhum item válido: ${opts.fasesVazias.map((f) => `"${f}"`).join(", ")}.`,
    "Preencha SOMENTE essas fases: para cada uma, objetivo de uma frase e 1 a 3 itens.",
    "Cada ref precisa ser copiada LETRA POR LETRA do CATÁLOGO RECOMENDÁVEL do system prompt.",
    opts.refsUsadas.length
      ? `Não repita estas refs que já estão no plano: ${opts.refsUsadas.join(", ")}.`
      : "",
    "Não invente refs: releia o catálogo e escolha o que EXISTE e mais avança o cenário do aluno.",
  ]
    .filter(Boolean)
    .join("\n");
  const contexto = coalesce([
    ...opts.history,
    { role: "assistant", content: "Entreguei o roadmap, mas parte das refs não existia no catálogo." },
    { role: "user", content: pedido },
  ]);

  const raw = await callLLM(
    planejamentoPrompt(opts.catalog.promptText, opts.firstName),
    contexto,
    refillSchema(opts.fasesVazias),
  );
  const obj = (raw ?? {}) as { fases?: unknown };
  return (Array.isArray(obj.fases) ? obj.fases : [])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      nome: typeof f.nome === "string" ? f.nome : "",
      objetivo: typeof f.objetivo === "string" ? semTravessao(f.objetivo) : "",
      itens: normalizeItens(f.itens),
    }))
    .filter((f) => opts.fasesVazias.includes(f.nome) && f.itens.length > 0);
}

/** Schema do backfill: didática + primeiro movimento por item existente. */
function didaticaSchema(chaves: string[]) {
  return {
    name: "didatica_dos_itens",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        itens: {
          type: "array",
          minItems: 1,
          maxItems: chaves.length,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              chave: { type: "string", enum: chaves, description: "kind:ref do item, copiada da lista." },
              didatica: {
                type: "string",
                description:
                  "2-4 frases didáticas: por que implementar/assistir este item agora, o que destrava nas fases seguintes, o que trava se pular. Para aula/curso: o que o aluno sai sabendo fazer e onde aplica no plano. Números só os do aluno. NUNCA repita nem parafraseie o motivo do item: a didatica começa onde o motivo termina.",
              },
              primeiroPasso: {
                type: "string",
                description:
                  "1 a 2 frases começando com VERBO NO IMPERATIVO: o que o aluno faz HOJE pra destravar este item, citando algo concreto do cenário dele (canal, ferramenta que já usa, número que deu, quem executa). PROIBIDO texto genérico do tipo 'abra pelo link e siga o passo a passo'.",
              },
            },
            required: ["chave", "didatica", "primeiroPasso"],
          },
        },
      },
      required: ["itens"],
    },
  };
}

/** O que o backfill devolve por item. */
export type ItemEnriquecido = { didatica: string; primeiroPasso: string };

/**
 * Backfill pra planos gravados antes dos campos existirem: manda o plano atual
 * + a entrevista e recebe, POR ITEM, a explicação de professor e o primeiro
 * movimento. Retorna mapa kind:ref -> {didatica, primeiroPasso}.
 */
export async function runEnriquecerDidatica(opts: {
  history: AgentTurn[];
  firstName: string;
  itens: { chave: string; titulo: string; fase: string; motivo: string }[];
}): Promise<Map<string, ItemEnriquecido>> {
  const out = new Map<string, ItemEnriquecido>();
  if (!opts.itens.length) return out;
  if (PROVIDER === "mock") {
    for (const i of opts.itens) {
      out.set(i.chave, {
        didatica: "Implementar agora destrava as fases seguintes do plano (mock).",
        primeiroPasso: "Abra o item e conecte o canal onde a dor aparece (mock).",
      });
    }
    return out;
  }
  const chaves = opts.itens.map((i) => i.chave);
  const lista = opts.itens
    .map((i) => `- chave=${i.chave} · "${i.titulo}" (fase: ${i.fase}). Motivo atual: ${i.motivo}`)
    .join("\n");
  const system = [
    "Você é o Gestor IA da Arkom no papel de PROFESSOR: a entrevista de planejamento com o",
    `aluno ${opts.firstName} está acima, e o roadmap dele já existe. Para CADA item listado,`,
    "escreva DUAS coisas.",
    "1. didatica (2-4 frases): por que implementar ou assistir ESTE item agora, o que ele",
    "   destrava nas fases seguintes, o que continua travado se ele pular, e como se encadeia",
    "   com a meta. Para aula ou curso: o que ele sai sabendo FAZER e em qual item aplica.",
    "   NUNCA repita nem parafraseie o motivo listado: a didatica começa onde o motivo termina.",
    "2. primeiroPasso (1 a 2 frases): o PRIMEIRO MOVIMENTO, começando com VERBO NO IMPERATIVO,",
    "   com o que ele faz HOJE pra destravar o item, citando algo concreto do cenário (canal,",
    "   ferramenta que já usa, número que deu, quem executa). Nada de 'abra pelo link e siga o",
    "   passo a passo': isso vale pra qualquer item e não ensina nada.",
    "Regras: português brasileiro, tom de professor direto, números SÓ os que o aluno deu,",
    "NUNCA travessão nem \" - \" como pontuação, sem markdown.",
  ].join("\n");
  const pedido = `[SISTEMA] Os itens do roadmap deste aluno:
${lista}

Escreva didatica e primeiroPasso de cada um, devolvendo a chave exata.`;
  const raw = await callLLM(
    system,
    coalesce([...opts.history, { role: "user", content: pedido }]),
    didaticaSchema(chaves),
  );
  const obj = (raw ?? {}) as { itens?: unknown };
  for (const i of Array.isArray(obj.itens) ? obj.itens : []) {
    if (!i || typeof i !== "object") continue;
    const { chave, didatica, primeiroPasso } = i as {
      chave?: unknown;
      didatica?: unknown;
      primeiroPasso?: unknown;
    };
    if (typeof chave !== "string" || !chaves.includes(chave)) continue;
    out.set(chave, {
      didatica: typeof didatica === "string" ? semTravessao(didatica).slice(0, 700) : "",
      primeiroPasso: typeof primeiroPasso === "string" ? semTravessao(primeiroPasso).slice(0, 400) : "",
    });
  }
  return out;
}

/** Schema do backfill de cenário (planos gravados antes do campo existir). */
const CENARIO_SCHEMA = {
  name: "cenario_da_entrevista",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      negocio: { type: "string", description: "O negócio e o momento, em 1 frase curta." },
      meta: { type: "string", description: "O objetivo do próximo capítulo, nos números do aluno." },
      dores: {
        type: "array",
        maxItems: 3,
        items: { type: "string" },
        description: "As dores que sangram hoje, cada uma com o número que o aluno deu.",
      },
      execucao: { type: "string", description: "Quem implementa e quanto tempo tem." },
    },
    required: ["negocio", "meta", "dores", "execucao"],
  },
} as const;

/**
 * Backfill do cenário pra planos antigos: relê a entrevista da thread e devolve
 * o retrato em 4 campos, SÓ com o que o aluno disse. Uma chamada curta; retorna
 * null se o modelo não devolver nada com substância.
 */
export async function runResumirCenario(opts: {
  history: AgentTurn[];
  firstName: string;
}): Promise<AgentCenario | null> {
  if (PROVIDER === "mock") {
    return {
      negocio: "Negócio descrito na entrevista (mock).",
      meta: "Meta informada pelo aluno (mock).",
      dores: ["Dor principal com o número do aluno (mock)."],
      execucao: "Quem implementa e o tempo disponível (mock).",
    };
  }
  const system = [
    "Você lê a entrevista do Cronograma de IAtização entre o Gestor IA da Arkom e o aluno",
    `${opts.firstName} e devolve o CENÁRIO em 4 campos curtos: negocio, meta, dores (1 a 3) e`,
    "execucao. Regras: use SÓ o que o aluno disse, com os números DELE; frases curtas em",
    "português brasileiro; NUNCA use travessão nem \" - \" como pontuação; campo sem informação",
    "na conversa fica como string vazia (ou lista vazia). Nada de inventar, resumir é espelhar.",
  ].join("\n");
  const pedido =
    "[SISTEMA] Extraia o cenário da entrevista acima nos 4 campos do schema, só com o que o aluno disse.";
  const raw = await callLLM(
    system,
    coalesce([...opts.history, { role: "user", content: pedido }]),
    CENARIO_SCHEMA,
  );
  return normalizeCenario(raw);
}

/**
 * Regeneração de UMA fase a pedido do aluno: mesma entrevista como contexto,
 * nova versão só daquela fase, evitando os itens atuais dela e proibindo refs
 * já usadas nas outras fases. Retorna null se o modelo não devolver item algum.
 */
export async function runRegenerarFase(opts: {
  catalog: ConsultorCatalog;
  history: AgentTurn[];
  firstName: string;
  faseNome: string;
  refsAtuais: string[];
  refsOutras: string[];
}): Promise<FaseItens | null> {
  if (PROVIDER === "mock") {
    const exclui = new Set([...opts.refsAtuais, ...opts.refsOutras]);
    const itens = mockItens(opts.catalog, exclui, 2);
    if (!itens.length) return null;
    return { nome: opts.faseNome, objetivo: "Nova versão desta etapa (mock).", itens };
  }

  const pedido = [
    `[SISTEMA] O aluno pediu uma NOVA versão da fase "${opts.faseNome}" do roadmap.`,
    "Monte outra versão dessa fase usando a mesma entrevista como contexto: objetivo de uma",
    "frase e 1 a 3 itens, cada um com ref copiada LETRA POR LETRA do CATÁLOGO RECOMENDÁVEL.",
    opts.refsAtuais.length
      ? `Evite repetir os itens atuais da fase (${opts.refsAtuais.join(", ")}); privilegie caminhos diferentes.`
      : "",
    opts.refsOutras.length
      ? `NÃO use refs que já estão nas outras fases do plano: ${opts.refsOutras.join(", ")}.`
      : "",
    "Motivo amarrado ao cenário do aluno e esforco honesto, como no plano original.",
  ]
    .filter(Boolean)
    .join("\n");
  const contexto = coalesce([...opts.history, { role: "user", content: pedido }]);

  const raw = await callLLM(
    planejamentoPrompt(opts.catalog.promptText, opts.firstName),
    contexto,
    REGEN_SCHEMA,
  );
  const obj = (raw ?? {}) as { objetivo?: unknown; itens?: unknown };
  const itens = normalizeItens(obj.itens);
  if (!itens.length) return null;
  return {
    nome: opts.faseNome,
    objetivo: typeof obj.objetivo === "string" ? semTravessao(obj.objetivo) : "",
    itens,
  };
}
