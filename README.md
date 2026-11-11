# ArkomGO

Plataforma agêntica da Arkom: o cliente descreve o que precisa, trabalha com agentes e ferramentas dentro da plataforma e acompanha as decisões com o contexto da sua empresa.

Este repositório reúne o **estado de desenvolvimento de 11/11/2026** do portal, SDR, CRM, deepH e backend em refatoração. A demo executa atendimento com IA e integra o CRM ao Clickmax de desenvolvimento. O Genesis coordena quatro agentes e já prepara alterações limitadas de qualificação SDR/CRM: gera e testa um artefato Go, oferece uma prévia e publica a regra no motor existente após aprovação. O estúdio de construção agora também coordena escrita de código Go e interface web, testes isolados e traces persistidos. Implantação e integração automática das aplicações geradas ainda estão no roteiro.

## Comece por aqui

- [Genesis Flutter e eventos em tempo real](apps/genesis_flutter/README.md)
- [Estúdio de construção: código, Gophers e traces](docs/GENESIS-CONSTRUCAO.md)
- [Primeira etapa agêntica: regra SDR/CRM em Go](docs/GENESIS-ETAPA-1.md)
- [Estrutura e responsabilidades](docs/ARQUITETURA.md)
- [Como preparar e executar a demo](docs/EXECUTAR.md)
- [Catálogo completo de diagramas Mermaid](docs/mermaid/README.md)
- [O que funciona e próximas etapas](docs/STATUS-E-ROADMAP.md)
- [Verificações desta publicação](docs/VALIDACAO.md)
- [Origem dos componentes](docs/source-manifest.json)

## Organização

| Pasta | Responsabilidade |
| --- | --- |
| `apps/portal` | Arkom Dash em Next.js: menu, identidade visual, mapa e ferramentas; demo em `/demo` |
| `services/sdr` | API, contexto da empresa, atendimento, sessões, automações, aprovações, workers e ponte Genesis |
| `services/crm` | CRMGO: contatos, funis e oportunidades; roteamento por empresa e integração Clickmax |
| `services/core` | Backend Arkom/Bia em refatoração, diretório, identidade, barramento e integrações |
| `packages/deeph` | Runtime Go de orquestração de agentes |
| `services/sdr/pkg/sdrsdk` | Contratos e clientes usados pelos workers do SDR |
| `services/sdr/demo/deeph` | Configuração dos agentes de planejamento Genesis |
| `docs/mermaid` | Diagramas editáveis e catálogo dos diagramas existentes nos componentes |
| `scripts` | Preparação e execução local; geração do catálogo de diagramas |

A árvore é uma consolidação de fontes, com módulos Go e aplicações Node independentes. Não é necessário iniciar `services/core` para abrir a demo integrada. Os repositórios de origem permanecem independentes e estão identificados no manifesto.

```mermaid
flowchart LR
    Cliente[Cliente] --> Portal[Portal Arkom]
    Portal --> SDR[API SDR e contexto da empresa]
    SDR --> Workers[Workers de contexto e execução]
    SDR --> Genesis[Genesis: planejamento]
    Genesis --> deepH[deepH: quatro agentes]
    deepH --> Provider[Provedor local / SDK OpenAI]
    SDR --> CRM[CRMGO]
    CRM --> Postgres[(PostgreSQL: rotas e entregas)]
    CRM --> Clickmax[Clickmax DEV: dados comerciais]
```

## Validação

A integração original foi verificada por TypeScript, testes Go e consultas reais ao ambiente DEV. O portal possui testes de sessão compartilhada e restrição do proxy local. A revisão visual interativa permanece pendente; testes HTTP não comprovam o comportamento completo da interface.

Consulte [EXECUTAR](docs/EXECUTAR.md) para requisitos, configuração e comandos. Credenciais, bancos, conversas, logs e arquivos de execução não fazem parte desta publicação. O modo simplificado da demo é exclusivo do ambiente local.
