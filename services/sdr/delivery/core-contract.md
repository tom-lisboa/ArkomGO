# Núcleo do negócio — piloto 0.5

Construído em 03/11/2026 no projeto independente `sdr-next-pilot`. Não é uma reconstrução comprovada do núcleo proprietário da Arkom: os corpos das funções centrais ainda não foram obtidos. Esta implementação atende ao fluxo descrito pelo usuário, sem importar dados nem acessar Supabase.

## O que já funciona

A empresa Alfa tem dados fictícios de automação comercial, duas ofertas, preços em centavos, taxa de implantação, condições, público, região, tom, fontes aprovadas e seis regras. A Beta tem uma escola fictícia com outro catálogo. O carregamento ocorre somente quando ainda não existe a base daquela empresa; não substitui edições existentes.

O cliente administrador edita um rascunho, confere o contexto e publica. Uma publicação fica imutável no fluxo da API e recebe número, data, responsável, motivo e impressão digital. A recuperação de uma versão cria outra publicação. O salvamento, a publicação, a auditoria e o cancelamento das saídas simuladas desatualizadas são confirmados na mesma transação do banco exclusivo do piloto. Falha de auditoria desfaz a operação inteira.

Cada fonte, oferta e regra tem escopo: todas as soluções habilitadas ou soluções específicas. A visibilidade de uma regra/oferta também exige que sua fonte esteja aprovada e visível para a solução. O servidor deriva a empresa e o perfil da sessão; não aceita `organization_id` no corpo de comandos. Os consumidores de contexto SDR, Atendimento e Marketing usam o mesmo núcleo. Apenas o SDR possui um fluxo de conversa nesta entrega; os demais são consumidores para testar o contrato, sem motores de atendimento/marketing.

## API

Todas as rotas exigem a sessão de teste já existente. Nenhum segredo do provedor ou código de acesso acompanha o modelo de Remix.

| Método | Rota | Controle |
|---|---|---|
| GET | `/v1/core/business` | Todos os perfis da empresa: rascunho, publicação e histórico |
| POST | `/v1/core/business/draft` | Administrador; perfil completo, revisão esperada, motivo e Idempotency-Key |
| POST | `/v1/core/business/preview` | Administrador/operador; `target: draft|published` e `solution: sdr|atendimento|marketing`; sem efeitos externos |
| POST | `/v1/core/business/publish` | Administrador; revisão esperada, motivo e Idempotency-Key |
| POST | `/v1/core/business/restore` | Administrador; versão a recuperar, revisão esperada, motivo e Idempotency-Key |
| GET | `/v1/core/solutions/{solution}/context` | Publicação filtrada da própria empresa; 404 se desabilitada |
| GET | `/v1/sdr/conversations/{id}/context` | Próxima base disponível e comprovante da última preparação, sempre na própria empresa |

Alterações simultâneas retornam 409, sem sobrescrever outra edição. A mesma chave com o mesmo comando retorna o resultado anterior; a mesma chave com outro comando retorna conflito. Dados incompletos, referências inválidas, fontes não aprovadas na publicação e escopos inválidos são recusados. Perfil viewer não edita, publica nem executa conferência; pode consultar a base salva e a publicação.

Limites deste piloto: 8 fontes manuais, 8 ofertas, 24 regras, 24 KB de perfil e 200 publicações por empresa. Contexto de negócio tem limite de 32 KB. Não há upload, busca vetorial nem ingestão de documentos nesta etapa. SQLite exclusivo persiste o estado e a auditoria transacional; capacidade para múltiplos processos/produção ainda exige evolução do armazenamento e dimensionamento.

## Ligação com o SDR

Uma entrada simulada com automação ativa prepara a publicação SDR da empresa e identifica até 20 mensagens recebidas/enviadas, limitadas a 16 KB de texto. Rascunhos, envios incertos/cancelados e saídas ainda na fila não são tratados como mensagens já enviadas. O comprovante guarda versão, impressão digital, IDs das mensagens, horário e informação de truncamento. O contexto histórico pode ser reconstruído a partir da publicação original; não é substituído silenciosamente pela versão atual. Por enquanto guarda-se o último comprovante de cada conversa, não um histórico completo de execuções.

Desabilitar o SDR impede preparar respostas automáticas. Publicar não retoma automação pausada/humana. Uma publicação invalida respostas automáticas pendentes da versão anterior; mensagens humanas continuam na fila. O contexto compartilhado não inclui o histórico de outras conversas ou soluções.

O texto da resposta ainda é fixo e a entrega permanece simulada. O núcleo não interpreta perguntas, não extrai memória comercial, não confirma agenda, não chama OpenAI nem envia mensagens ao WhatsApp real. Janela baseada em bytes/mensagens não é orçamento de tokens do modelo. A futura integração precisa separar os dados do negócio das instruções do sistema e preservar as regras de execução.

## Roteiro para trabalhar agora

1. Abra o piloto e entre em Alfa, perfil Administrador, com o código de teste fornecido separadamente.
2. Em Conhecimento do negócio, confira o catálogo e selecione Ver a base publicada para SDR.
3. Troque o consumidor para Atendimento ou Marketing: a regra/fonte exclusiva de qualificação do SDR não deve aparecer.
4. Altere um preço de exemplo e salve o rascunho. A base publicada deve continuar com o valor anterior.
5. Confira o rascunho, revise as fontes e publique. Todos os consumidores autorizados passam a ler o novo valor e a mesma versão.
6. Em Conversas, simule uma entrada. A resposta fixa exibe a versão de negócio usada; seu conteúdo não é uma avaliação de inteligência.
7. Recupere a versão anterior no histórico: deve surgir uma publicação nova com o valor recuperado.
8. Entre na Beta e confirme o negócio de idiomas. Nenhuma edição da Alfa deve aparecer ali.

## Como avaliar resultado posteriormente

`core-benchmark-cases.json` contém perguntas e critérios esperados para a futura integração de IA. Elas não foram respondidas por modelo nesta entrega. Os testes do núcleo comprovam isolamento, propagação de configurações, origem dos dados, proteção contra edição concorrente, recuperação, persistência e respeito à pausa. Não comprovam melhora de conversão ou superioridade ao SDR anterior.

Antes de liberar atendimento real, executar os mesmos casos com a configuração candidata e uma referência autorizada, em ambiente isolado, medindo: preço/condição corretos, perguntas repetidas, informações inventadas, ações confirmadas sem ferramenta, respeito ao humano, tempo, custo e revisão humana. Registrar versão/configuração/dados usados. Resultados comerciais precisam de homologação e comparação real; não podem ser garantidos pela linguagem Go ou por testes de infraestrutura.
