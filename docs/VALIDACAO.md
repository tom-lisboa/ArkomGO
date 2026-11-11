# Validação da publicação — 11/11/2026

Verificações realizadas sobre a cópia consolidada, antes do primeiro push:

| Verificação | Resultado |
| --- | --- |
| `go test ./...` em `services/sdr` | Passou |
| `go test ./...` em `services/crm` | Passou; testes que dependem de banco externo não provisionados nesta rodada |
| `go test ./...` em `services/core` | Passou |
| `go test ./...` em `packages/deeph` | Passou |
| Geração dos tipos Next e `tsc --noEmit` no portal | Passou usando as dependências já instaladas do checkout de origem |
| Testes de sessão e proxy do portal | 4 passaram |
| Sintaxe Mermaid pelo parser 11.12.0 | 65 diagramas passaram |
| Compilação sintática dos scripts Python | Passou |
| Launcher sem chave | Recusou iniciar com mensagem de configuração |
| Launcher com portas já ocupadas | Recusou iniciar, sem encerrar os serviços existentes |
| Gitleaks 8.30.1 | Zero achados após remoção de identificadores de instância e exceções exatas para placeholders de documentação/teste |
| Comparação com credenciais privadas conhecidas, feita somente em memória | Nenhuma ocorrência nos arquivos selecionados |

Não foi realizada uma inicialização completa do novo launcher contra uma base vazia. A demo original permanece em execução em outro checkout. O backend da demo original já havia respondido a consultas reais, executado os agentes Genesis e criado uma oportunidade fictícia no Clickmax DEV.

A revisão visual interativa e o fluxo comercial completo de cadastro/instalação continuam pendentes. Publicação de código não equivale a implantação da aplicação. Nenhuma suíte desta rodada valida construção automática de aplicações pelo Genesis; essa capacidade ainda não existe na demo.
