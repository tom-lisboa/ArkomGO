# Navegação e revisões incrementais

Novos projetos usam o plano versão 3 com as mesmas seis etapas. UX produz `design/ux.json` e `design/navigation.json`: rota inicial, telas, títulos, componentes e itens de menu. Projetos e revisões anteriores preservam sua versão; não há conversão automática nem exigência retroativa do mapa.

O mapa usa `arkom.navigation.v1`, com 1 a 12 rotas locais. Parâmetros são permitidos apenas no último segmento (`/clientes/:id`); rotas estáticas como `/clientes/novo` têm precedência. Rotas duplicadas/ambíguas, componentes fora de `frontend/src/pages/`, home inexistente e detalhes parametrizados no menu são recusados. Rotas de tela são independentes dos endpoints Go declarados em `application.json`.

## Interface executável

`App.svelte` é o layout compartilhado. Os agentes usam `Router` de `@arkom/Router.svelte` e `routes`, `current`, `href`, `navigate` de `@arkom/navigation`, fornecidos pelo compilador. O Router conecta cada página declarada, passa `params`, atualiza título/foco e apresenta página não encontrada. O menu é criado pelo agente com links reais e indicação da página atual; as decisões visuais continuam pertencendo ao produto.

URLs usam fragmentos (`#/clientes/42`), permitindo acesso direto, recarga e histórico sem configurar um servidor de SPA. Na prévia isolada, “Abrir rota” permite testar um endereço inicial; navegar dentro do aplicativo não modifica a URL do estúdio. No HTML exportado, o fragmento pertence à URL do próprio aplicativo. A API permanece no bridge autenticado da plataforma, sem credenciais dentro do iframe e sem liberar rede externa.

O compilador exige as páginas declaradas e a inclusão do Router no bundle. A validação estrutural gera `navigation.validated`/`navigation.rejected`; a conexão estática ao bundle gera `navigation.built`. O recibo Svelte inclui o mapa, e alterações nele invalidam a compilação anterior. Esses eventos não afirmam teste visual ou teste comportamental individual da aplicação gerada. Os testes da plataforma exercitam uma aplicação de referência com lista, criação, detalhe, histórico, abertura direta, rota desconhecida e chamadas pela ponte da API.

## Trabalhar sobre o que já está pronto

Retomar uma etapa existente continua do checkpoint salvo. Em uma aplicação pronta, marque **Alterar somente a interface** antes de enviar a melhoria para começar diretamente na interface, seguida da revisão final. O backend, o planejamento, UX, design e mapa de rotas são reaproveitados; os agentes não podem sobrescrevê-los nem alterar `application.json`, inclusive durante a revisão final. Se a mudança depender deles, deve ser solicitada uma revisão completa.

A API aceita `revision_scope: "interface"` junto de `parent_id`. O pai precisa pertencer à mesma organização, estar pronto, com contrato válido, compilação atual e SDK ainda compatível. Etapas anteriores aparecem como `step.reused`, com ID/revisão do pai e digest dos arquivos. Não são criados testes ou conclusões fictícias. O pai permanece intacto; a nova revisão tem seus próprios arquivos, execução e traces. A revisão final continua compilando e executando os testes Go da entrega.

Esta primeira modalidade incremental cobre alterações na interface existente. Adicionar rotas, alterar contratos ou mudar regras do backend ainda exige revisão completa. Seleção automática de partes afetadas e integrações efetivas com outros produtos Arkom não estão incluídas nesta entrega.
