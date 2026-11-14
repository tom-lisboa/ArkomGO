# Genesis Flutter

A plataforma Arkom usa Flutter Web 3.50.0 diretamente, servida pelo Go na porta 3007. O Flutter mantém o menu, o histórico, o Início com squads, ferramentas, negócio, CRM, Luma e o estúdio Genesis. Não há hospedeiro Next. `/demo` abre o time; a logo Arkom leva para `/demo/home`. Os frontends próprios da BIA, Maia e FinanceAI são incorporados como agentes com autenticação vinculada à empresa.

## Executar

Na raiz do repositório:

```sh
FLUTTER_BIN=/caminho/flutter/bin/flutter python3 scripts/build-genesis-flutter.py
python3 scripts/demo.py
```

O script compila os assets em `build/web` (saída ignorada pelo Git), servidos diretamente pelo Go em `/genesis-flutter/`. Para preparar outra máquina, use o [SDK oficial Flutter](https://docs.flutter.dev/install/manual). Nesta estação há uma instalação local em `.local/flutter`. Fontes e CanvasKit são servidos localmente, sem CDN no carregamento do estúdio.

## Eventos e sessão

`web/bridge.js` é somente o transporte do navegador: abre a sessão local em memória e compartilha a identidade entre os widgets da plataforma e do estúdio; mantém o token em memória; usa `fetch` autenticado para comandos e para SSE. Não há tokens na URL, no armazenamento local ou no bundle. O código gerado é exibido como texto nos detalhes. A prévia executa a interface gerada em um iframe separado com `sandbox="allow-scripts"`, origem opaca e CSP sem rede, frames, objetos, formulários ou navegação do portal. Não recebe sessão Arkom.

`GET /v1/sdr/genesis-demo/construction/{id}/events?after={sequence}` entrega `snapshot`, `update`, `end` e `session.expired`. O primeiro quadro contém arquivos atuais; os seguintes trazem deltas de traces. A API notifica somente após persistir cada ação. O cliente aplica escritas aos arquivos, elimina duplicatas por sequência, reconecta com cursor e interrompe a conexão anterior ao trocar de projeto. O servidor valida empresa e sessão, limita conexões por empresa e emite heartbeat a cada 10 segundos. O proxy encaminha o stream sem acumular a resposta.

Tempo real significa eventos de ações e resultados assim que persistidos. Não é transmissão de raciocínio privado nem de tokens intermediários do modelo. Resumos são identificados como resumos do agente. Dados dos testes de layout são apenas fixtures; a aplicação não injeta eventos demonstrativos.

## Validação

Dentro desta pasta: `flutter analyze` e `flutter test`. Na raiz: `node --test apps/genesis_flutter/test/*.test.cjs`. No módulo SDR: `go test ./...`.

Os testes Flutter cobrem layouts de 1280, 900 e 390 px e atualização de arquivos/eventos. As imagens de referência em `test/goldens` foram geradas e inspecionadas no macOS; comparação pixel a pixel fica restrita a esse sistema. O CI Linux executa os testes de layout e estado. Os testes Go cobrem push ao vivo, replay, isolamento por empresa, cancelamento e ausência de eventos de escritas não persistidas.

Os testes cobrem também a alternância entre solução e código sem recriar a prévia, o histórico de ações e a expiração da atividade dos agentes. Build, renderizações Flutter e validação HTTP/SSE não substituem a revisão dos fluxos completos no navegador.

## Ver a solução criada

O estúdio organiza a conversa à esquerda e a solução na área principal. Os controles **Solução** e **Código** no topo alternam a prévia e o explorador de arquivos sem recriar a interface gerada. Em telas pequenas, a conversa abre pelo ícone no topo.

Quando `frontend/index.html` estiver disponível, o Flutter incorpora uma prévia interativa usando os arquivos HTML/CSS/JS já persistidos, sem pedir uma nova geração. Escritas na interface atualizam a prévia com debounce; a conclusão da construção carrega a versão final.

Eventos novos exibem um Gopher animado e um resumo temporário sobre a solução; a atividade desaparece após sete segundos e continua disponível no histórico, com detalhes antes/depois. Snapshots de reconexão não reapresentam ações antigas como atividade ao vivo. O menu permite rever ações persistidas em uma reprodução identificada, usando a prévia atual e sem alterar o histórico.

A prévia suporta interface estática, lógica local e chamadas ao backend Go isolado. Recursos locais de script e stylesheet são incorporados. Em construções concluídas, compatíveis e com contrato validado, o estúdio conecta a solução automaticamente e o rodapé mostra a preparação. Se necessário, use **Conectar solução**; **Mais opções → Pausar solução** encerra a execução. O processo dura até cinco minutos, e o menu permite encerrá-lo. Memória comum é temporária; aplicações que usam o [contrato de dados](../../docs/GENESIS-DADOS-APLICACAO.md) conservam um documento entre execuções. Projetos antigos precisam ser continuados para receber a entrada `NewHandler`. Veja o [contrato e limites da execução](../../docs/GENESIS-RUNTIME-PREVIA.md). A montagem não altera o projeto original nem declara a aplicação publicada.

## Construir por partes

Novas ideias começam pelo planejamento. O painel **Passo a passo** mostra estado, critério e traces de cada fase. Clique em uma fase para abrir seu histórico; use **Iniciar próxima etapa** após revisar o checkpoint. Falhas e interrupções mantêm o mesmo passo disponível para retomada. Os estados vêm dos traces persistidos, sem estimativa por tempo. Veja [o contrato desse fluxo](../../docs/GENESIS-PASSO-A-PASSO.md).

A aplicação Flutter também hospeda o catálogo e as superfícies locais SDR/CRM/CLIPS/contexto. Consulte [a migração da plataforma](../../docs/ECOSISTEMA-LOCAL-FLUTTER.md).

`web/agents.js` mantém as superfícies dos agentes, valida janela/origem/nonce e fecha todas na troca de empresa. O retorno FinanceAI → Maia preserva a tela da Maia. Os testes `platform-navigation.test.cjs` cobrem essas fronteiras e a navegação sem recarregar o Flutter.

O botão no menu recolhe a navegação; o botão no topo da tela a reabre. A única preferência salva no navegador é `arkom.ui.navigation.collapsed` (booleano), sem identidade, token ou dados de clientes. Os agentes ficam imediatamente abaixo de Início.
