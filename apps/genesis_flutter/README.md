# Genesis Flutter

O estúdio de construção do Genesis usa Flutter Web 3.50.0, integrado ao portal Arkom em `/demo/genesis`. O portal mantém a navegação e entrega a sessão ao iframe de mesma origem; a tela principal, personagens, controles, arquivos, alterações e resultados são widgets Flutter. O ajuste legado de qualificação SDR/CRM permanece acessível pelo link no rodapé.

## Executar

Na raiz do repositório:

```sh
FLUTTER_BIN=/caminho/flutter/bin/flutter python3 scripts/build-genesis-flutter.py
python3 scripts/demo.py
```

O script compila e copia os assets para `apps/portal/public/genesis-flutter` (saída ignorada pelo Git). Para preparar outra máquina, use o [SDK oficial Flutter](https://docs.flutter.dev/install/manual). Nesta estação há uma instalação local em `.local/flutter`. Fontes e CanvasKit são servidos localmente, sem CDN no carregamento do estúdio.

## Eventos e sessão

`web/bridge.js` é somente o transporte do navegador: recebe a sessão via `postMessage` verificando origem e janela pai; mantém o token em memória; usa `fetch` autenticado para comandos e para SSE. Não há tokens na URL, no armazenamento local ou no bundle. O código gerado é exibido como texto nos detalhes. A prévia executa somente a interface gerada em um iframe separado com `sandbox="allow-scripts"`, origem opaca e CSP sem rede, frames, objetos, formulários ou navegação do portal. Não recebe sessão Arkom.

`GET /v1/sdr/genesis-demo/construction/{id}/events?after={sequence}` entrega `snapshot`, `update`, `end` e `session.expired`. O primeiro quadro contém arquivos atuais; os seguintes trazem deltas de traces. A API notifica somente após persistir cada ação. O cliente aplica escritas aos arquivos, elimina duplicatas por sequência, reconecta com cursor e interrompe a conexão anterior ao trocar de projeto. O servidor valida empresa e sessão, limita conexões por empresa e emite heartbeat a cada 10 segundos. O proxy encaminha o stream sem acumular a resposta.

Tempo real significa eventos de ações e resultados assim que persistidos. Não é transmissão de raciocínio privado nem de tokens intermediários do modelo. Resumos são identificados como resumos do agente. Dados dos testes de layout são apenas fixtures; a aplicação não injeta eventos demonstrativos.

## Validação

Dentro desta pasta: `flutter analyze` e `flutter test`. Na raiz: `node --test apps/genesis_flutter/test/*.test.cjs`. No módulo SDR: `go test ./...`.

Os testes Flutter cobrem layouts de 1280, 900 e 390 px e atualização de arquivos/eventos. As imagens de referência em `test/goldens` foram geradas e inspecionadas no macOS; comparação pixel a pixel fica restrita a esse sistema. O CI Linux executa os testes de layout e estado. Os testes Go cobrem push ao vivo, replay, isolamento por empresa, cancelamento e ausência de eventos de escritas não persistidas.

Revisão interativa no navegador ainda pendente porque o acesso CUA está desativado. Build, renderizações Flutter e validação HTTP/SSE não substituem essa verificação.

## Ver a solução criada

Quando `frontend/index.html` estiver disponível, a seção **Sua solução** aparece antes das ferramentas de construção. O Flutter incorpora uma prévia interativa usando os arquivos HTML/CSS/JS já persistidos, sem pedir uma nova geração. Ela abre automaticamente e pode ser recolhida ou atualizada. Ao concluir a construção, a prévia é recarregada com a versão final.

Esta prévia suporta interface estática e lógica local, como a calculadora. Recursos locais de script e stylesheet são incorporados; rede e serviços Go não são conectados automaticamente. Aplicações dependentes de API exigem a futura execução autenticada do backend. A montagem não altera o projeto original nem declara a aplicação publicada.
