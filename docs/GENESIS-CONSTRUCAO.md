# Genesis: construção de código com deepH

O estúdio em `/demo/genesis` recebe um pedido e coordena quatro papéis que escrevem código específico para ele. Cada ação produz um evento persistido: consulta de contrato, escrita de arquivo, resultado de teste e encerramento de etapa. O cliente acompanha Gophers no visual escuro e dourado da Arkom, pode interromper, consultar alterações, baixar o projeto e continuar a partir de uma cópia dos arquivos.

## O que esta etapa entrega

- **Arquiteto:** consulta o catálogo da Arkom e registra escopo e contratos em `DESIGN.md`.
- **Construtor Go:** escreve domínio, endpoints e testes; recebe as falhas e pode corrigir o código.
- **Designer:** escreve HTML, CSS e JavaScript para o pedido.
- **Revisor:** revisa os artefatos, pode alterá-los e precisa concluir a validação Go.

Os quatro papéis são etapas sequenciais do `packages/deeph/pkg/construction.Engine`, com arquivos compartilhados. Não são quatro processos simultâneos. O motor determina as ferramentas disponíveis e executa suas ações; o provedor decide o conteúdo e as próximas ações. A geração usa o cliente OpenAI do SDK existente, com resposta estruturada e `store=false`. Somente mensagens finais (ou sem fase, para compatibilidade) são interpretadas como ações; mensagens `commentary` são descartadas, conforme o [contrato de Structured Outputs do SDK oficial](https://github.com/openai/openai-node/blob/main/docs/structured-outputs.md). Respostas incompletas ou ambíguas são rejeitadas.

A liberdade de construção está no código de domínio, na interface e nas revisões. Os papéis orientam o trabalho, mas todos podem colaborar nos arquivos permitidos do projeto; a separação por papel não bloqueia uma melhoria entre camadas. O módulo Go, os contratos de plataforma e os limites de execução pertencem à Arkom. Esta versão usa somente a biblioteca padrão Go e arquivos web sem dependências externas.

## Reuso do ecossistema

Antes de escrever, o motor exige leitura de `reference/catalog.json` e `reference/platform-contracts.go`. Também oferece referências versionadas dos tipos do SDR e da integração CRMGO. O catálogo ainda cobre apenas as capacidades verificadas na etapa anterior; não representa integração completa das 23 soluções.

O pacote `platform` fornece `Tenant`, `Lead` e uma interface de consulta ao CRM. É uma fronteira para injetar o serviço real, não uma conexão já instalada no projeto gerado. Dados, segredos e bancos de clientes não são entregues ao modelo nem aos testes. O novo domínio pode usar essas interfaces e preparar seus adaptadores; a ligação autenticada aos serviços Arkom é uma etapa posterior.

## Execução, traces e recuperação

A API autenticada fica em `/v1/sdr/genesis-demo/construction`, atrás dos controles da demo local. Listagem, consulta, exportação e continuação são restritas à empresa da sessão; o perfil de leitura não cria nem interrompe construções.

Cada escrita persiste junto com seu trace, incluindo conteúdo anterior e novo, no SQLite existente. A interface consulta os eventos por cursor e mostra código, alterações e saída dos testes. Os resumos dos agentes descrevem ações; não representam raciocínio privado nem evidência de que uma operação externa ocorreu.

Falha transitória do provedor admite uma nova tentativa por etapa, registrada nos traces; não há repetição automática ilimitada.

A construção tem prazo de 20 minutos, no máximo 48 arquivos/350 KB e rodadas limitadas por papel (4/10/6/8). A demo admite uma construção ativa por processo e 20 projetos por empresa. Interromper preserva arquivos; reiniciar o servidor marca projetos incompletos como interrompidos. Continuar cria outro projeto ligado ao anterior e usa o pedido escrito no campo principal.

## Testes isolados

O backend gerado é copiado para uma pasta temporária. O host restaura `go.mod` e os contratos protegidos, executa `go test -v -count=1 -timeout=25s ./...` e devolve a saída limitada ao time. Ausência de fonte Go, de testes ou de um teste de comportamento aprovado impede concluir a validação. Backend e revisor passam por validação final obrigatória, independentemente do que o modelo declarar.

No macOS, a demo usa `sandbox-exec`, ambiente sem credenciais herdadas, bloqueio de rede, de leitura dos diretórios de usuários e de escrita fora da pasta temporária. No Linux, o executor foi implementado com Docker sem rede, volume somente leitura, usuário sem privilégios e limites de recursos; exige Docker e a imagem `golang:1.26`. A execução Linux ainda precisa de homologação específica. O isolamento local não substitui um serviço de execução endurecido para clientes de produção.

## Limite da entrega

`Código pronto` significa que os arquivos foram gerados e os testes Go passaram. Isso não comprova todos os requisitos, a segurança do código gerado, testes visuais, integração de serviços reais ou disponibilidade da aplicação para uso. Testes gerados pelo próprio time precisam de evolução para critérios independentes de aceitação.

Nesta etapa não há implantação automática, criação de banco comercial, publicação na operação ou Remix Lovable. O fluxo anterior de qualificação SDR/CRM continua acessível pelo botão abaixo do estúdio. O próximo incremento pode ligar projetos a um runtime Arkom, com identidade de empresa confiável, persistência, adaptadores autenticados e prévia executável antes da ativação.

Diagrama editável: [construção, testes e traces](mermaid/08-genesis-construcao-traces.mmd).

## Validação desta entrega — 11/11/2026

- Suites Go do SDR e deepH; testes do executor macOS, isolamento por empresa, cancelamento, persistência e recuperação.
- Caso de regressão do provedor: descartar comentário intermediário, aceitar resposta final única e rejeitar resposta incompleta ou ambígua.
- TypeScript do portal, build do frontend de demonstração e sintaxe de 67 diagramas Mermaid.
- Ensaio com IA real: cadastro e filtro de lotes de leilão, domínio e handlers Go, validação e testes de isolamento por organização. O ensaio concluído tem 12 arquivos, 94 eventos e quatro etapas finalizadas; os testes Go finais passaram e o ZIP coincide com os arquivos persistidos.
- Cancelamento real pela API e continuação em outro projeto a partir dos oito arquivos preservados. A nova construção completou o backend, interface demonstrativa e revisão.
- Revisão visual interativa pendente: acesso ao navegador desativado no aplicativo. HTTP 200 e compilação não comprovam a experiência visual.

Próxima direção: backend primeiro; o frontend definitivo será Flutter, conforme [decisão arquitetural](ARQUITETURA.md#direção-do-frontend-flutter). Esta entrega conserva a interface de validação construída antes dessa decisão.
