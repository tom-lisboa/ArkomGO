# Estado atual e evolução

| Capacidade | Estado |
| --- | --- |
| Genesis Flutter com Gophers e traces via SSE | Implementado no portal de demonstração; demais telas ainda em React |
| Portal com visual Arkom e navegação por ferramentas | Implementado na demo local |
| Sessão compartilhada, CRM e SDR no portal | Implementado; verificação visual interativa pendente |
| Atendimento com IA e workers separados | Exercitado com dados fictícios |
| CRMGO e oportunidade no Clickmax DEV | Exercitado com integração real |
| Planejamento Genesis com quatro agentes deepH | Exercitado com inferência real |
| Alterar critérios de qualificação SDR/CRM por Genesis | Implementado: contrato, artefato Go testado, prévia, aprovação, versão e restauração |
| Gerar código Go e interface web por agentes, com traces | Implementado no estúdio de construção; testes isolados e exportação |
| Publicar e operar aplicações novas dentro da Arkom | Ainda não implementado |
| Catálogo operacional das 23 soluções | Ainda não integrado por completo |
| Remix automático para a conta Lovable do cliente | Ainda não implementado |
| Provisionamento comercial multiempresa de ponta a ponta | Ainda não concluído |

## Prioridade definida

Neste momento, evoluir backend Go, deepH, contratos e execução. Quando a etapa de interface começar, migrar o frontend completo para Flutter. A demo web existente permanece como instrumento de validação. A migração começou pelo estúdio Genesis a pedido do usuário; demais telas ainda pendentes.

## Entregas incrementais

1. Consolidar componentes compartilhados, sessão e contexto entre portal, SDR e CRM. Revisar desktop e celular.
2. Expandir a primeira mudança executável de qualificação para outras capacidades, mantendo prévia, aprovação, testes e versões recuperáveis.
3. Evoluir os traces de construção já implementados com critérios independentes de aceitação e fila de aprovações. O resumo atual mostra disponibilidade de IA, funis e aprovações nas 30 execuções mais recentes.
4. Implantar diretório de capacidades das 23 soluções, com contratos e permissões versionados e instalação por empresa.
5. Ligar o código produzido no estúdio a persistência, adaptadores das soluções e prévia executável, com publicação controlada.
6. Entregar Remix e personalização mantendo os mesmos contratos de backend e os limites de cada cliente.

Critério do produto: o cliente deve conseguir criar, usar e pedir mudanças em linguagem comum. A plataforma traduz isso em operações rastreáveis, sem exigir que ele administre código, infraestrutura ou credenciais.
