# Migração gradual do CLIPS

O primeiro fluxo proposto é o processamento de vídeo do CLIPS. O piloto local comprova que a fila em Go consegue chamar o worker original, gerar um MP4 vertical legendado e armazenar o resultado no Postgres. A integração com o aplicativo, a autorização por cliente, os dados reais e a capacidade sob carga ainda precisam ser validados. A migração de produção segue condicionada à autorização do responsável.

A interface de referência é a do repositório oficial `Bilhon-OS/arkom-clips`, com o design system ARKOM. O CLIPS Go fornece a API, a fila, o banco e o worker. A integração deve preservar as telas, componentes, estilos e jornadas existentes. A tela experimental separada foi retirada do piloto.

## Separar os dois incidentes do piloto

- **Uso do Supabase.** Confirmar em Usage qual cota foi excedida no ciclo. Com autorização, medir as invocações por projeto e função no mesmo intervalo e calcular a participação do CLIPS. Registrar latência, erros e picos junto da contagem. O total do API Gateway e o total mensal de Edge Functions são métricas distintas. A migração do CLIPS só resolve a parcela da carga que ele gera.
- **Login.** Registrar a mensagem exata e confirmar a data da tentativa por volta de 11h07 de Brasília. Com autorização de leitura, verificar se a sessão chegou a ser criada e qual foi a primeira requisição que falhou. Seguir o [roteiro do incidente](clips-triagem-login-e-piloto.md).

## Levantar o contrato do fluxo existente

O [inventário de `solutions`](edge-functions/solutions-inventory.csv) registrou dez funções com prefixo `clips_`. Todas estavam publicadas com verificação de JWT habilitada no momento da exportação. O inventário identifica nomes, versões e configuração de publicação. O comportamento e o uso precisam ser verificados no código e nos registros de execução.

| Funções do inventário | O que confirmar no código |
|---|---|
| `clips_process-project`, `clips_analyze-clips` | Quem cria a tarefa, estados do projeto, callbacks e efeitos em caso de falha ou repetição |
| `clips_trim-video`, `clips_video-track-person` | Contrato de entrada e saída, fontes de vídeo, legendas, enquadramento e limites de duração |
| `clips_download-youtube`, `clips_get-cobalt-url`, `clips_get-video-info`, `clips_get-youtube-captions` | Dependências externas, caminhos alternativos, URLs assinadas e tratamento de erros |
| `clips_settings`, `clips_test-integration` | Escopo por organização, credenciais e como cada cliente seleciona seu worker |

O acesso de leitura ao [repositório do aplicativo](https://github.com/Bilhon-OS/arkom-clips) foi confirmado em 06/11. A revisão usou o commit `f44b29e60c355e397c95d4360083a10b9f7ec113`, além do [worker de mídia](https://github.com/Bilhon-OS/clips-ai-worker) e do código publicado de `clips_settings` e `clips_process-project` em `solutions`.

## Primeiro cliente

- O fluxo existente valida a sessão e resolve a organização antes de despachar o processamento. Sem `x-org-id`, há um caminho de seleção por instância CLIPS e um fallback por associação. Isso é uma hipótese a investigar se a sessão existir e o acesso falhar na seleção da organização. A causa do incidente ainda depende da primeira requisição com erro.
- A URL do worker fica em `app_clips.app_settings`, com uma configuração por `org_id`. Trocar essa URL afetaria toda a organização no CLIPS. A configuração exige HTTPS e o piloto local implementa apenas o recorte. O fluxo atual também usa download, extração de áudio, transcrição, análise, Storage, atualização do projeto e retomada de tarefas. A URL só pode apontar para outro serviço depois de validar o contrato completo dos chamadores afetados.
- Para um teste com uma única pessoa, resolver o usuário autenticado, a instância CLIPS e a organização no servidor e habilitar apenas novos projetos que correspondam aos três. Testar a mesma pessoa em outra solução, outra pessoa da mesma organização e a mesma pessoa em outra organização. Todos devem continuar no fluxo existente. Preservar identidade, associações, permissões e configurações compartilhadas.
- O processamento publicado pode apagar e recriar transcrições e cortes do projeto ao reprocessá-lo. O primeiro teste deve criar um projeto novo. A volta deve direcionar somente os próximos pedidos e preservar a leitura dos resultados já gerados. A retomada automática precisa consultar a mesma decisão de roteamento para evitar execução em duplicidade.

### Achados da revisão do aplicativo

- A senha passa pelo Supabase Auth. Com sessão válida, a rota protegida ainda depende da resolução da organização no `core`. Em três testes locais com backend simulado, a ausência de sessão impediu a consulta de organização, o vínculo CLIPS teve precedência quando não havia instância explícita, e erros retornados pelas consultas de organização viraram `null`, o mesmo resultado de um vínculo ausente. Portanto a tela pode indicar falta de acesso para uma falha técnica. Os três testes de diagnóstico, seis testes existentes de mensagens de autenticação e a verificação de tipos do app e das Edge Functions passaram. O erro desse cliente ainda precisa ser correlacionado com a tentativa real.
- O piloto já testou o recorte de vídeo e está mais próximo do contrato de **exportação** do que do pipeline completo de projetos. O primeiro teste pode limitar o Go a um único projeto novo e autorizado no `clips_trim-video`. O aplicativo espera HTTP 202 com `exportPath` e consulta `clips-videos` até o MP4 ficar disponível. A integração em homologação deve preservar esse contrato, deduplicar o pedido e validar a gravação no caminho autorizado. A decisão deve ser feita no servidor com usuário, organização e projeto verificados. A regra fica restrita ao CLIPS e a configuração compartilhada do worker segue fora da mudança.

## Homologar com a mesma experiência do cliente

1. Manter Supabase Auth, dados de negócio e Storage como fonte de verdade na primeira etapa. Usar o Postgres do Go para fila e estado interno. Mapear o ID do projeto e da organização até o resultado e garantir autorização em cada operação, inclusive no download.
2. Criar casos com dados fictícios que cubram criação de projeto, processamento, legendas, download, tentativas, falhas e isolamento entre organizações. Exercitar as mesmas chamadas e estados que o aplicativo existente espera. Medir tempo de fila, tempo de renderização e taxa de falhas. Para vídeos maiores, validar armazenamento de objetos, renovação da reserva e limites de concorrência.
3. Antes de mover qualquer registro ou arquivo de negócio, inventariar as tabelas, chaves e objetos que o código usa. Incluir, conforme existam, projetos, cortes, originais, legendas, histórico, vínculos de usuários, permissões, configurações e direitos de acesso. Ensaiar restauração em ambiente separado. Comparar contagens por organização, referências entre registros, existência e integridade dos arquivos e acesso pelo aplicativo. Resolver toda divergência antes do corte.

## Transferir clientes em lotes e ensaiar a volta

1. Colocar o roteamento atrás de uma chave por organização. Começar com uma conta interna, depois um grupo autorizado. Para cada projeto, fixar o caminho de execução no momento da criação. O caminho legado e o novo precisam compartilhar uma regra que impeça processamento e cobranças duplicadas para o mesmo pedido.
2. Antes de ampliar, comparar com a linha de base as taxas de conclusão e falha, os tempos de espera, o volume de invocações do Supabase e os chamados de suporte. Definir os limites de avanço com o responsável antes de receber clientes.
3. Se houver regressão, voltar os **novos pedidos** do grupo ao fluxo anterior. Preservar o acompanhamento e os arquivos dos pedidos já aceitos pelo Go. Deixar tarefas em andamento terminarem ou reconciliá-las por ID antes de qualquer reprocessamento. Validar o procedimento em homologação.
4. Desativar uma função somente depois de confirmar que seus chamadores migraram, que as tarefas pendentes foram tratadas e que existe uma janela de observação e um retorno ensaiado. Tratar a transferência do banco de negócio e do Auth como uma etapa separada, com plano próprio.

**Próxima entrega verificável:** uma exportação de um projeto fictício disparada pelo aplicativo em homologação, mantendo o contrato de `clips_trim-video` e demonstrando o retorno ao caminho antigo. O processamento completo de `clips_process-project` pode ser avaliado depois desse recorte.

Em 06/11, o [teste de homologação local](../pilots/clips/README.md) executou o hook real do aplicativo até o download de um MP4, com Auth e Storage simulados. O Go aceitou apenas o usuário, a organização, o projeto novo e o corte fictícios previstos. Outro projeto, outro usuário da mesma organização e outro corte receberam a indicação de caminho legado. A base local ficou com um pedido concluído e um MP4 após reenvios e reinício. Isso valida o contrato local. A integração no ambiente de homologação do cliente e o caminho legado real seguem pendentes.

O teste foi ampliado para abrir o build oficial no Chromium e clicar em **Exportar** na tela de detalhes de um projeto novo fictício. O build passou pelo guard do design system. O Go devolveu HTTP 202, o aplicativo consultou o `exportPath` e baixou um MP4 real de 13,6 segundos e 720 × 1280. O Postgres exclusivo ficou com um pedido concluído em uma tentativa e um MP4. O navegador interceptou as chamadas do Supabase e a checagem do código rastreado da interface passou sem diferenças.

## Login de homologação com Auth real

Foi preparada uma alteração local do aplicativo, na branch `codex/clips-login-homolog`, preservada em `pilots/clips/login-homolog.patch`. O modo `clips-homolog` exige URL, chave pública e instância de teste explícitas e recusa o projeto central. O build padrão foi conferido para continuar apontando ao destino original.

A tela oficial autenticou uma conta confirmada criada no Supabase Auth GoTrue local, com Postgres exclusivo. Senha errada retornou 400, senha correta retornou 200 e o dashboard abriu. A sessão resistiu à recarga. O teste distinguiu uma falha técnica de resolução de organização de uma instância sem vínculo. O modo de homologação não usou a primeira membership como alternativa à instância. Onze testes unitários, a verificação de tipos, o build e o guard do design system passaram.

Os dados do dashboard e a resolução da organização continuam controlados por um adaptador autenticado de teste. Não houve validação do gerador de remixes do sistema nem publicação. O [guia de reprodução](../pilots/clips/README.md) inclui a preparação do Auth e o comando completo. Nenhum dado adicional do usuário é necessário para repetir essa validação local.

## Etapa 1 — infraestrutura publicada

Em 06/11 foi instalada a homologação `clips-go-homolog` no servidor Arkom, com API Go, worker, Postgres e volume exclusivos, HTTPS protegido para uso técnico e backup consistente incluindo os arquivos. O teste externo gerou um MP4 real e validou deduplicação e recusa sem token. O backup criptografado foi restaurado em outro banco e o hash do vídeo recuperado conferiu. O monitor detectou e recuperou a falha do worker. Os 25 containers anteriores mantiveram seus IDs.

A API usa o domínio técnico `clipsgo-homolog.24-199-100-186.sslip.io`. O armazenamento de vídeo nesta etapa é o próprio Postgres, limitado a arquivos pequenos e à fila de teste. O acesso é por token técnico, anterior ao login de clientes. A cópia externa roda neste Mac e depende de sua disponibilidade. O [guia da instalação](../pilots/clips/deploy/README.md) reúne os limites e os procedimentos operacionais.

## Etapa 2 — identidade individual

O backend foi ampliado para cadastrar a conta oficial e sua instância CLIPS exata no Postgres próprio, usando uma consulta de origem somente de leitura. A autenticação usa uma ponte: validação de um access token no Supabase central e emissão de sessão Go. Isso preserva a credencial existente sem copiar ou redefinir a senha. O [contrato de acesso individual](clips-go-acesso-cliente.md) descreve o isolamento, a integração com a interface oficial e os limites dessa entrega. A publicação da interface e o teste interativo do cliente continuam pendentes; não é possível declarar o incidente original resolvido apenas com o cadastro.

## Etapa 3 — interface oficial publicada

A interface foi conectada ao backend no modo `clips-go` e publicada em [homologação](https://clipsgo-homolog.24-199-100-186.sslip.io/login), no release `r-4452ffb375eb`. A tela de login, os estilos, os tokens e a marca foram preservados. O fluxo de uma conta fictícia em Auth real local passou por login, recarga, upload, renderização pelo Go, download, exclusão e logout. Os 484 testes da interface passaram. A publicação mantém o Auth central apenas para identidade; todos os dados e arquivos novos ficam no backend isolado. O [registro da interface](clips-go-interface-homologacao.md) reúne os testes, os limites do piloto e a reprodução. Login interativo do cliente, histórico e pipeline completo ainda não estão validados como migração de operação.

## Verificação das lacunas para uso operacional

Uma consulta somente de leitura ao vínculo exato do cliente encontrou zero projetos, cortes e transcrições no projeto central `solutions`. As configurações consultadas não indicaram transcrição nem URL de worker configuradas nessa organização. Isso não descarta histórico em outro backend de remix. O [levantamento operacional](clips-go-lacunas-operacao.md) registra o escopo, a capacidade observada e a ordem de implementação: armazenamento e uploads maiores, transcrição/legendas, análise e múltiplos cortes, histórico e validação com o cliente. A verificação não alterou a publicação nem ativou fornecedores.
