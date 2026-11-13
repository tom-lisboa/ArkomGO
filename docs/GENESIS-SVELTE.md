# Base Svelte do Genesis

Novos projetos criados no Genesis usam Svelte 5.57.3 e esbuild 0.28.2. O backend gerado continua em Go e o próprio estúdio continua em Flutter. Retomadas e revisões de projetos anteriores preservam HTML/JS/CSS; esta entrega não migra aplicações nem altera seus dados.

## Fluxo e traces

Novos projetos incluem arquitetura, UX, design visual, backend, interface e revisão, iniciadas uma por vez pelo usuário. Projetos anteriores mantêm suas quatro etapas. Veja [UX e design por etapas](GENESIS-UX-DESIGN.md). Na interface, o agente escreve `frontend/src/App.svelte`, componentes `.svelte`, módulos `.js`/`.ts` e CSS locais. O host compila esses arquivos quando o agente chama `test` e novamente antes de concluir interface e revisão.

- `frontend.build.started`: compilação iniciada em isolamento.
- `frontend.build.failed`: diagnóstico devolvido ao agente para correção; a etapa permanece incompleta.
- `file.written`, com autor `system`: artefatos produzidos pelo compilador.
- `frontend.build.passed`: compilação concluída, com os avisos do compilador.

O estúdio apresenta as compilações separadamente dos testes Go. Compilar com sucesso não comprova qualidade visual, acessibilidade ou comportamento completo; os avisos e a necessidade de inspeção visual permanecem explícitos.

O host controla `frontend/svelte.json`, `index.html`, `bundle.js`, `bundle.css` e `build.json`. O recibo liga os artefatos às fontes e ao manifesto por digest. Alterações nas fontes invalidam a prévia anterior. A revisão final e a execução recusam bundles desatualizados. O ZIP mantém componentes, artefatos e recibo.

## Ferramentas e isolamento

Instale as dependências com `npm ci --ignore-scripts` em `packages/genesis-frontend`. O launcher `scripts/demo.py` define `ARKOM_FRONTEND_TOOLCHAIN` automaticamente; o build completo também instala esse pacote.

O processo de compilação usa configuração da plataforma e nunca importa/executa os módulos gerados no Node. Não aceita scripts de instalação, plugins, configurações do projeto, pacotes arbitrários nem imports remotos. Imports relativos ficam restritos às fontes recebidas. A aplicação pode usar os módulos de UI permitidos do Svelte, CSS local e TypeScript que o compilador suporta sem preprocessador.

No macOS, Node instalado em `/usr` ou `/opt/homebrew` executa sob `sandbox-exec`, sem rede, sem acesso aos demais arquivos do usuário e com escrita limitada ao diretório temporário. No Linux, prepare Docker e `node:24-bookworm-slim`; o processo usa usuário sem privilégios, rede desabilitada, filesystem somente leitura e limites de recursos. Não existe fallback sem isolamento.

Limites desta base: 48 arquivos no workspace, 48 KB por fonte, 350 KB de fontes, 256 KiB por artefato e 384 KiB de bundle total. A compilação tem prazo de 45 segundos. Sem SvelteKit, SSR, dependências escolhidas pelo agente, assets binários ou fontes externas nesta entrega.

## Validação

- `npm test` em `packages/genesis-frontend`: componentes reais, TypeScript, CSS, clique reativo, chamada à API, erros, avisos e imports recusados.
- Testes Go: escrita protegida, compilação obrigatória, invalidação, retomada após erro, recibos e persistência dos traces.
- CI `svelte`: executa o compilador real dentro do isolamento Docker, incluindo casos inválidos.
- Testes Flutter e da ponte de prévia: regressão do estúdio e da comunicação com o backend.

## Próximas entregas

A divisão de UX e design está descrita em [UX e design por etapas](GENESIS-UX-DESIGN.md). A revisão visual e os testes de comportamento da interface são os próximos incrementos; a compilação continua sem representar aprovação visual.
