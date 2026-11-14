# Estado atual e evolução

| Capacidade | Estado |
| --- | --- |
| Plataforma local em Flutter | Plataforma Flutter, navegação persistente e servidor Go; o Next foi excluído. Frontends próprios dos agentes são incorporados |
| Portal com visual Arkom e navegação por ferramentas | Implementado na demo local |
| Sessão compartilhada, CRM e SDR no portal | Implementado; navegação, agentes e menu verificados em desktop e celular |
| Lia: agenda própria por empresa | Integrada ao time e à BIA; disponibilidade, reservas, remarcações, cancelamentos e aprovações pelo worker Go local |
| WhatsApp e mídia da BIA | Gateway e worker ativos no ambiente local. QR e preparação de anexo verificados no navegador. Pareamento, envio e leitura de mídias recebidas dependem de teste com número autorizado |
| Meus dados da BIA | ZIP da empresa para administradores, com download e isolamento verificados |
| Atendimento com IA e workers separados | Exercitado com dados fictícios |
| CRMGO e oportunidade no Clickmax DEV | Exercitado com integração real |
| Planejamento Genesis com quatro agentes deepH | Exercitado com inferência real |
| Alterar critérios de qualificação SDR/CRM por Genesis | Implementado: contrato, artefato Go testado, prévia, aprovação, versão e restauração |
| Gerar código Go e interface web por agentes, com traces | Implementado no estúdio de construção; testes isolados e exportação |
| Construção por etapas ligada aos traces | Implementado: planejamento, checkpoints, avanço explícito e retomada |
| Backend Go na prévia | Implementado: processo isolado e rotas autenticadas |
| Persistência mínima da aplicação | Implementado: um documento JSON por empresa/aplicação, com commit e auditoria |
| Contrato versionado de aplicações geradas | Implementado: identidade, revisão, rotas, capacidades, validação e exportação |
| Publicar e operar aplicações novas dentro da Arkom | Ainda não implementado |
| Catálogo local | 17 entradas; 7 com serviços internos, 10 bloqueadas. Disponibilidade depende da configuração e da empresa |
| Remix automático para a conta Lovable do cliente | Ainda não implementado |
| Provisionamento comercial multiempresa de ponta a ponta | Ainda não concluído |

## Prioridade definida

Integrar os serviços existentes na plataforma Flutter e evoluir o backend Go, o deepH, os contratos e a execução. BIA, Lia, Maia e FinanceAI têm interfaces próprias dentro da plataforma. Áreas sem serviço integrado ficam bloqueadas.

## Entregas incrementais

1. Consolidar componentes compartilhados, sessão e contexto entre portal, SDR e CRM. Revisar desktop e celular.
2. Expandir a primeira mudança executável de qualificação para outras capacidades, mantendo prévia, aprovação, testes e versões recuperáveis.
3. A [construção por etapas](GENESIS-PASSO-A-PASSO.md) já liga checkpoints aos traces. Evoluir depois a divisão dinâmica em entregas funcionais. O resumo atual mostra disponibilidade de IA, funis e aprovações nas 30 execuções mais recentes.
4. Implantar diretório de capacidades das 23 soluções, com contratos e permissões versionados e instalação por empresa.
5. Com o [contrato versionado](GENESIS-CONTRATO-APLICACAO.md) implementado, ligar o código produzido no estúdio a persistência, adaptadores das soluções e prévia executável, com publicação controlada.
6. Entregar Remix e personalização mantendo os mesmos contratos de backend e os limites de cada cliente.

Critério do produto: o cliente deve conseguir criar, usar e pedir mudanças em linguagem comum. A plataforma traduz isso em operações rastreáveis, sem exigir que ele administre código, infraestrutura ou credenciais.

## Regra de evolução

Uma entrega pequena por vez, com critério verificável e resultado registrado.
A [primeira persistência](GENESIS-DADOS-APLICACAO.md) já salva e recupera um
documento por empresa/aplicação. Próximas entregas devem ampliar isso em pequenos
incrementos, sem antecipar adaptadores e publicação.

Veja o [escopo da migração Flutter e integração local](ECOSISTEMA-LOCAL-FLUTTER.md).
