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

`web/bridge.js` é somente o transporte do navegador: recebe a sessão via `postMessage` verificando origem e janela pai; mantém o token em memória; usa `fetch` autenticado para comandos e para SSE. Não há tokens na URL, no armazenamento local ou no bundle. O código gerado pelos agentes é exibido como texto, nunca executado pelo estúdio.

`GET /v1/sdr/genesis-demo/construction/{id}/events?after={sequence}` entrega `snapshot`, `update`, `end` e `session.expired`. O primeiro quadro contém arquivos atuais; os seguintes trazem deltas de traces. A API notifica somente após persistir cada ação. O cliente aplica escritas aos arquivos, elimina duplicatas por sequência, reconecta com cursor e interrompe a conexão anterior ao trocar de projeto. O servidor valida empresa e sessão, limita conexões por empresa e emite heartbeat a cada 10 segundos. O proxy encaminha o stream sem acumular a resposta.

Tempo real significa eventos de ações e resultados assim que persistidos. Não é transmissão de raciocínio privado nem de tokens intermediários do modelo. Resumos são identificados como resumos do agente. Dados dos testes de layout são apenas fixtures; a aplicação não injeta eventos demonstrativos.

## Validação

Dentro desta pasta: `flutter analyze` e `flutter test`. Na raiz: `node --test apps/genesis_flutter/test/bridge.test.cjs`. No módulo SDR: `go test ./...`.

Os testes Flutter cobrem layouts de 1280, 900 e 390 px e atualização de arquivos/eventos. As imagens de referência em `test/goldens` foram geradas e inspecionadas no macOS; comparação pixel a pixel fica restrita a esse sistema. O CI Linux executa os testes de layout e estado. Os testes Go cobrem push ao vivo, replay, isolamento por empresa, cancelamento e ausência de eventos de escritas não persistidas.

Revisão interativa no navegador ainda pendente porque o acesso CUA está desativado. Build, renderizações Flutter e validação HTTP/SSE não substituem essa verificação.
