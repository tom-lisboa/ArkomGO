# Estrutura da ArkomGO

## Experiência do cliente

O cliente informa seu objetivo em linguagem comum. A Arkom mantém o contexto da empresa e apresenta ferramentas por função. Ele usa SDR, CRM e demais soluções dentro do portal. O objetivo do Genesis é também construir aplicações novas — por exemplo, uma solução para leilões que utilize serviços do Finance — aproveitando contratos do ecossistema.

Os nomes Git, banco de dados, SDK e workspace não precisam fazer parte da jornada comercial. Nesta demo alguns termos DEV ainda aparecem para identificar o ambiente de teste.

## Camadas implementadas

**Plataforma Flutter e servidor Go.** `apps/genesis_flutter` implementa a navegação, o Início com squads, ferramentas, negócio, CRM, Luma e Genesis. `services/sdr/platform_web.go` serve os arquivos compilados na porta 3007 e encaminha `/api/demo/backend/*` para a API local em 8080, preservando Bearer, idempotência e SSE. O servidor web recebe somente caminhos dos builds e configuração local, sem credenciais de provedores. Os frontends próprios dos agentes são uma exceção: BIA em `apps/agents/bia` (Vite), Maia e FinanceAI nos checkouts existentes. `web/agents.js` verifica origem, janela e nonce antes de entregar a sessão; a troca de empresa destrói as superfícies anteriores. A plataforma não utiliza Next.js.

**SDR e workers.** `services/sdr` autentica sessões, mantém o contexto publicado, histórico e estado do piloto em SQLite. Os workers de contexto e execução usam os contratos de `pkg/sdrsdk`, com credenciais próprias e listener separado. Fluxos de negócio e controles de aprovação já existem no motor de plataforma. Sua existência não significa que o plano Genesis já seja executável.

**Genesis — qualificação.** A ponte Go inicia um processo deepH com o fluxo `contexto > sdr + crm > revisor`. Contexto é preparado primeiro; os especialistas SDR e CRM produzem propostas; o revisor consolida o resultado. O provedor HTTP local chama OpenAI pelo SDK existente. O revisor produz um plano e, para critérios de qualificação SDR/CRM, uma especificação estrita. O pacote Arkom do deepH gera e testa um artefato Go; a prévia e aprovação permitem publicar essa regra no motor Go existente. Consulte [a etapa 1](GENESIS-ETAPA-1.md). Os relatórios ficam em arquivos locais e o índice de execuções permanece em memória; ainda não é uma fila durável de construção. Propostas de alteração, versões e auditoria são persistidas no SQLite do SDR.

**Genesis — construção.** O novo estúdio usa o `construction.Engine` do deepH como biblioteca no serviço Go. Quatro papéis sequenciais escrevem arquivos específicos do pedido, consultam contratos e corrigem falhas de testes isolados. Arquivos e eventos são persistidos juntos no SQLite, com isolamento de acesso por empresa, cancelamento, continuação e exportação. O frontend apresenta Gophers, atividade, código e alterações. Código pronto ainda precisa de adaptadores autenticados e implantação. Consulte [construção e traces](GENESIS-CONSTRUCAO.md).

**CRMGO.** `services/crm` recebe chamadas da Bia e eventos de qualificação. O PostgreSQL mantém as rotas por organização e instalação, além do estado das entregas. Contatos, pipelines, etapas e cards estão no Clickmax. Portanto, nesta etapa a Arkom controla o acesso e a orquestração, mas o armazenamento comercial depende do Clickmax.

**Backend em refatoração.** `services/core` preserva o trabalho de diretório comum, identidade, barramento, calendários, integrações e Bia. É uma base distinta do SDR Next; a consolidação não unifica automaticamente os dois modelos de dados nem os dois runtimes. Documentos internos dessa pasta registram a evolução das outras soluções, incluindo CLIPS e a entrada comum.

## Direção do frontend: Flutter

Decisão de produto em 13/11/2026: toda a plataforma usa Flutter e o backend continua em Go com deepH. O antigo hospedeiro Next foi excluído. O SDK Flutter 3.50.0 está instalado em `.local/flutter` nesta estação. O Início (`/demo`) mostra os squads; clicar na logo Arkom abre a visão geral (`/demo/home`). A navegação usa o histórico do navegador sem recriar o motor Flutter. As telas dos agentes são mantidas durante a troca de abas e descartadas na mudança de sessão.

A integração deve permanecer por API autenticada: identidade da empresa, permissões, arquivos, estados, traces, cancelamento e exportação pertencem ao backend. O estúdio Flutter já consome esses contratos e acompanha eventos persistidos por SSE; os demais clientes Flutter deverão consumir os mesmos contratos sem acessar credenciais de serviços ou bancos. A identidade visual Arkom e os Gophers continuam como requisitos de produto, independentes do framework.

A compatibilidade do futuro frontend Flutter com o Remix Lovable ainda exige desenho e validação; esta decisão não significa que o código Flutter já seja exportável para Lovable. Os arquivos HTML/CSS/JS gerados no ensaio atual são artefatos do protótipo, não a arquitetura definitiva do frontend. Referência fornecida: [instalação oficial do Flutter com VS Code](https://docs.flutter.dev/install/with-vs-code).

## Limites por empresa

A sessão identifica organização e perfil. Serviços resolvem a instalação e as credenciais pelo backend. O navegador usa a sessão da Arkom; chaves OpenAI, Clickmax e tokens entre serviços permanecem no servidor. A entrada simplificada Alfa depende de flags DEV e loopback e não é o cadastro comercial definitivo.

A configuração de autonomia deve ser aplicada pelo backend, por tipo de operação. A primeira alteração de qualificação já mostra prévia, exige aprovação e registra uma versão recuperável. Esse caminho será ampliado para outras capacidades.

## As 23 soluções e o Remix

O catálogo completo das 23 soluções é uma meta de integração. A demo não conecta todas elas. É necessário inventariar cada capacidade, contrato, autenticação, eventos, limites, instalação por empresa e suporte a reversão. SDR e CRM são o primeiro recorte operacional; deepH é infraestrutura de orquestração.

O SDR contém um template de frontend em `services/sdr/delivery/lovable-template`. O botão de Remix comercial e o provisionamento automático no Lovable ainda não estão conectados. O destino arquitetural é manter backend, dados e permissões sob gestão da Arkom e permitir personalizar a interface ou pedir melhorias por conversa. Ainda será necessário definir quais mudanças de backend o cliente pode solicitar e como elas são validadas e publicadas.

## Origem e manutenção

O manifesto registra a origem e o commit-base de cada componente. Os arquivos refletem também as alterações locais não commitadas no momento da captura. Não foi importado o histórico Git antigo. Scripts operacionais herdados descrevem outros ambientes; o ponto de entrada desta demo é `docs/EXECUTAR.md`.

O pacote deepH inclui runtime, CLI, agentes e documentação técnica. O site de marketing independente do deepH, binários compilados, caches e sessões foram omitidos desta consolidação. Exemplos de credenciais de instância em patches históricos foram substituídos por placeholders.
