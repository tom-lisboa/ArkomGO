# Criação de frontend no Genesis

O caminho principal é uma conversa: o cliente descreve a página, acompanha a prévia e pede mudanças em linguagem comum. O chat envia `mode: frontend`. O host executa automaticamente intenção, UX, design, GIFs, implementação, scroll e revisão, sem aprovação técnica entre fases. Cada nova mensagem pode reconsiderar composição, identidade e navegação. Não existe catálogo obrigatório de templates. Todos os arquivos backend e application.json permanecem imutáveis no motor deepH integrado em `packages/deeph`.

O motor recebe ações estruturadas por streaming, aplica cada arquivo completo e já compila uma prévia parcial em isolamento, sem esperar o fim da resposta. Em páginas novas, a primeira região real pode aparecer ainda no planejamento. Arquivos incompletos nunca substituem fontes salvas. A prévia parcial não exige que todas as rotas já existam e recebe recibo preview_only; apenas a compilação completa permite concluir a entrega. Uma fonte que ainda não compila mantém a última prévia funcional. As setas coloridas permanecem ativas durante a execução real do agente e usam eventos de geração, leitura/escrita e os vínculos dos elementos com as fontes Svelte. Escritas revelam os elementos correspondentes; leituras apenas os destacam. A animação respeita a preferência de movimento reduzido e não representa inspeção visual automatizada. O progresso à direita deriva dos checkpoints persistidos. Cancelar interrompe a passagem ao próximo agente. Um pedido posterior pode continuar uma criação interrompida.

Código e edição direta são opções secundárias. **Editar diretamente** seleciona elementos; textos literais permitem clique duplo ou propriedades. Cores, larguras, tipografia e espaçamentos são pré-visualizados no rascunho. O editor de código aceita componentes, CSS e módulos. Criar página em branco fica no menu avançado.

Salvar frontend compila as fontes no executor Svelte existente, sem chamar a IA nem executar o backend. Uma falha mantém a versão salva e o rascunho. O servidor grava fontes, bundle, recibo e histórico na mesma transação, com conferência da sequência. Uma alteração concorrente bloqueia a gravação e mantém o rascunho para copiar ou revisar antes de reabrir a versão salva.

Os elementos são ligados a posições da AST Svelte. Textos dinâmicos e estilos com expressões continuam editáveis pelo código. Uma alteração visual em componente reutilizado afeta suas instâncias. A edição não importa HTML serializado nem sobrescreve scripts/eventos Svelte.

A prévia permanece em origem opaca e só pode propor seleção/texto aos controles do host. A gravação exige a sessão do projeto e da empresa. Fontes de backend, manifestos e bundles não são aceitos pelo endpoint de edição. Projetos em geração não recebem gravações manuais. O runtime anterior é encerrado após uma edição salva; suas fontes Go permanecem iguais.

O Genesis organiza o time de Agentes Visuais em três áreas: espaço reservado de Back-end à esquerda (sem conversa ativa nesta etapa), prévia central e conversa de Front-end à direita. O passo a passo pode ser expandido dentro do painel de Front-end. Em telas menores, conversa e prévia alternam pelo botão do chat; o progresso também abre pelo botão de etapas. A edição manual é por rascunho e salvamento explícito. Não há colaboração simultânea sobre o mesmo elemento, edição de texto dinâmico pelo canvas ou reorganização livre por arraste nesta etapa.

## Motor de criação

A integração deepH usada pelo Genesis fica em `packages/deeph` nesta ArkomGO. O compilador passa a produzir os vínculos entre a AST Svelte e os elementos da prévia. As instruções de frontend orientam composição específica para o negócio, tokens CSS, componentes, responsividade, controles com comportamento e preservação de edições manuais. Essas instruções guiam a geração; não certificam qualidade visual automaticamente.

## Agentes de GIF e scroll

Novas conversas usam o fluxo v5 com sete especialistas; projetos anteriores mantêm seus checkpoints até o próximo pedido. Luma gera GIFs pelo worker já existente do CLIPS, com a identidade da empresa e do usuário no servidor. O pedido usa a chave já cadastrada na conta ou seu saldo de brinde. Uma chave de idempotência por construção impede uma segunda compra ao repetir a mesma ação. Falhas do worker não são repetidas automaticamente. Limites: uma geração por pedido, até quatro assets no projeto e até 2 MiB por GIF, com 2–16 quadros de até 512 × 512.

O host valida o GIF, produz uma imagem estática e salva `frontend/media.json`, inacessível para escrita pelos agentes ou pelo editor de fontes. O modelo recebe somente metadados. A compilação incorpora os assets ao HTML exportável e seu recibo cobre o conteúdo da mídia. A prévia permanece sem acesso à rede; nenhuma chave, cookie ou URL autenticada entra na página. `@arkom/AnimatedImage.svelte` oferece pausa e atende a `prefers-reduced-motion`.

Fluxo implementa o scroll após a construção da página, com Motion 14.14.0 e Lenis 1.3.27 instalados no compilador, sem CDN. O agente pode compor diretamente com essas bibliotecas ou usar as ações Svelte `reveal`, `parallax`, `smoothScroll` e `scrollProgress` de `@arkom/motion`. Os adaptadores limpam listeners ao desmontar e respeitam movimento reduzido. A especificação fica em `design/motion.json`. A geração continua livre: os efeitos e a necessidade de mídia seguem o pedido, sem impor um layout.

Referências: [Motion scroll](https://motion.dev/docs/scroll), [Motion + Svelte](https://motion.dev/docs/svelte), [Lenis](https://github.com/darkroomengineering/lenis). As bibliotecas selecionadas usam licença MIT; seus avisos são preservados no bundle.
