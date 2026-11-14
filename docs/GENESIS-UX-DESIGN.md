# UX e design por etapas

O plano versão 2 introduziu: Planejar → Definir experiência → Definir design visual → Construir backend → Construir interface Svelte → Validar entrega. Cada avanço continua exigindo o checkpoint exato e uma ação explícita do cliente. O estúdio não simula progresso: estados, contagem e intervalos de traces vêm dos eventos persistidos.

Lia, agente `ux`, escreve somente `design/ux.json`: público, tarefa principal, jornada, telas, estados de carregamento/vazio/erro/sucesso, acessibilidade e critérios de comportamento. Cora, agente `designer`, lê essa entrega e escreve somente `design/ui.json`: direção visual, paleta, tipografia, espaçamento, componentes, responsividade e acessibilidade. Não executam testes Go, compilação ou alterações no código.

Os arquivos são JSON com estrutura controlada para permitir validação e leitura no estúdio. Campos obrigatórios, descrições não vazias, limites de listas e cores hexadecimais são verificados. Os traces `design.rejected` e `design.validated` registram o resultado; uma especificação inválida não conclui a etapa. A interface e a revisão também exigem as duas especificações válidas. O recibo de cada checkpoint identifica o conjunto de arquivos salvo por digest.

Em cada etapa já produzida, “Ler experiência” ou “Ler design visual” abre a especificação em uma apresentação legível. Ela também permanece disponível no explorador e no ZIP exportado. O time exibido acompanha a versão do plano do projeto.

## Limites da validação

Validar a estrutura não comprova qualidade de design, acessibilidade, contraste real ou usabilidade. Os agentes não devem alegar pesquisa ou inspeção visual não realizada. A implementação Svelte recebe as decisões de UX/UI e a revisão recebe seus critérios de comportamento, mas testes automáticos de navegador e inspeção visual continuam sendo uma entrega posterior.

## Compatibilidade

Projetos existentes com plano versão 1 continuam com quatro etapas; retomadas e revisões preservam a versão do pai. Projetos novos recebem seis etapas. Nenhum histórico é reescrito ou convertido silenciosamente. A versão é persistida no backend e passada ao motor de construção; agentes não a escolhem por arquivo.

## Validação desta entrega

Testes Go cobrem os escopos dos agentes, bloqueio de execução nas etapas de planejamento, especificações incompletas, ordem das seis etapas, checkpoints persistidos, retomada após reinício e preservação de revisões antigas. Testes Flutter verificam a abertura da especificação a partir da etapa em larguras de celular e desktop, além das regressões do estúdio.

A próxima parte pode adicionar validação de comportamento da interface e revisão visual dos resultados gerados, mantendo entregas pequenas e evidências reais nos traces.

Novos projetos agora usam a [versão 3, com navegação e revisão incremental](GENESIS-NAVIGATION.md). As revisões de projetos versão 2 preservam suas seis etapas e arquivos existentes.
