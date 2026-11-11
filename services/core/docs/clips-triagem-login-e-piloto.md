# CLIPS: triagem de login e piloto de processamento

06/11/2026. O incidente de acesso continua aberto. A origem da falha e o alcance entre clientes ainda precisam ser confirmados.

Horário informado para a tentativa: aproximadamente **11h07 de Brasília (14h07 UTC)**. Considerando 06/11 como a data da tentativa, a janela inicial é **13h57 a 14h17 UTC**. Confirmar a data e obter a mensagem exata. Usar a janela para correlacionar os registros após autorização de leitura.

Em seguida, o suporte enviou um print do **preview do remix no Lovable**, ainda em `/login`, com a mensagem **“E-mail ou senha incorretos”**. O print mostra o endereço terminado em `1028`. O suporte informou que também foi usado o endereço oficial terminado em `1026`. O erro do segundo envio precisa ser correlacionado com seu próprio registro. A mensagem é compatível com `invalid_credentials` no código do CLIPS. O print não revela o código HTTP, o código da resposta nem o Supabase que o preview chamou. A credencial aparece no print. Orientar o cliente a trocá-la pelo fluxo oficial e pedir capturas futuras com os campos sensíveis ocultos.

Na próxima tentativa feita pelo próprio cliente, em um ambiente aprovado, coletar só o hostname da requisição de autenticação, o status HTTP e o `code` da resposta. Se o preview estiver usando outro projeto, revisar a ligação do remix com o Auth previsto. Se estiver no projeto correto e retornar `invalid_credentials` para o e-mail oficial, pedir ao responsável uma conferência de leitura da conta e usar o fluxo de recuperação do próprio CLIPS. A seleção de organização e o worker entram depois da sessão.

### Conferência de leitura em 06/11

- O Auth de `solutions` contém a conta oficial (`1026`), com provedor e-mail, confirmação em 21/08 e campo de banimento vazio. O último login exibido foi 11h22 no fuso de Cuiabá, ou 12h22 de Brasília, depois do incidente. O campo indica sucesso no Auth central. A origem do login não foi identificada.
- Nos eventos Auth do central de 14h05 a 14h10 UTC, os `POST /token` exibidos tiveram status 200. A falha do print não foi identificada nessa janela. O recorte depende do horário informado e do que o painel exibiu.
- A [correção de remixes no PR #10](https://github.com/Bilhon-OS/arkom-clips/pull/10) documenta que, antes dela, um remix com Lovable Cloud podia autenticar no Supabase do próprio remix em vez do central. Essa é a hipótese prioritária diante da falta de um evento correspondente no central. O preview do print não pôde ser inspecionado sem sessão, pois o endereço inferido do projeto retornou 403.
- **Causa específica em aberto.** A evidência que fecha a distinção é o hostname e o resultado da chamada `POST /auth/v1/token` feita pelo preview, usando o e-mail oficial. Registrar apenas host, status e código. Não incluir corpo da requisição ou credenciais.

## Incidente de login

1. Registrar a hora da tentativa com fuso, a tela em que travou e a mensagem exata. Se o suporte tiver uma reprodução autorizada, anotar a primeira requisição que falha, seu status, o código do erro e o identificador da requisição. Remover senhas, tokens, cookies e links de recuperação do material compartilhado.
2. Pedir ao responsável pelo CLIPS que confirme qual projeto e provedor de autenticação o aplicativo publicado usa. Com autorização de leitura, correlacionar a tentativa com os logs desse projeto. Confirmar se outra conta de teste autorizada consegue passar pelo mesmo fluxo.
3. Se a autenticação falhar, consultar o código retornado e verificar, conforme o erro, a existência da conta, o provedor vinculado e o estado da confirmação ou do bloqueio. Para falhas de link ou callback, verificar a URL de redirecionamento e a entrega pelo provedor. Usar apenas o fluxo oficial de recuperação se o diagnóstico indicar essa ação.
4. Se a sessão for criada, identificar a primeira chamada do CLIPS que falha. Se for consulta de perfil, organização ou acesso, confirmar o vínculo pelo ID da sessão e verificar a política de acesso. Se for Edge Function, correlacionar com os logs da função e verificar se houve restrição de uso naquele momento. Se as chamadas funcionarem, verificar se a aplicação descartou a sessão ou redirecionou incorretamente.
5. Reproduzir com conta fictícia em homologação, validar a menor correção para a causa comprovada e definir como revertê-la. A correção em produção depende da autorização do responsável. Após aplicá-la, confirmar o acesso com o suporte e validar uma conta de controle.

## Uso do Supabase

O painel de `solutions` mostra, em 24 horas, 2.090.763 registros no API Gateway, 216.875 no cartão de Edge Functions e 3.145 erros no cartão de Postgres. A faixa de limite excedido não identifica qual cota foi afetada. O total mensal de Edge Function Invocations deve ser confirmado na página Usage da organização. Os números da captura não identificam a origem da falha de login.

Fontes: captura compartilhada em 06/11 e [documentação do Spend Cap](https://supabase.com/docs/guides/platform/cost-control).

## Piloto em paralelo

- O [worker de vídeo existente](https://github.com/Bilhon-OS/clips-ai-worker/blob/main/README.md) faz download, extração de áudio, medição de enquadramento e corte. O inventário local inclui `clips_process-project`. Validar seu código e seus chamadores antes de adotar esse fluxo como piloto de orquestração.
- Usar Go para receber e enfileirar um pedido de processamento, despachar para um adaptador falso em homologação e persistir o estado e o resultado em Postgres. Reusar os padrões de fila e recuperação já existentes no Arkon. O piloto deve verificar concorrência, tentativas limitadas, retomada e deduplicação antes de conectar o worker de vídeo de teste.
- Começar com um banco separado e dados sintéticos. Para mudanças no banco do CLIPS, obter o esquema autorizado e reproduzir consultas e permissões com dados fictícios. Conferir extensões, índices e planos de execução para cada mudança proposta.
- Para um eventual corte, decidir a fonte de verdade de cada dado, ensaiar a transferência e validar contagens, integridade, permissões e retorno à versão anterior. Tratar Supabase Auth, sessões, políticas, Storage e webhooks como dependências explícitas.

Critério do piloto: um pedido repetido produz um único resultado, uma falha intermediária pode ser retomada e a aplicação de teste consegue acompanhar o processamento até a conclusão. O diagnóstico do login segue separadamente.

Em 06/11, quatro testes de integração existentes do Arkon passaram em uma instância isolada de PostgreSQL 17.11. Eles verificaram idempotência sob concorrência, expiração e retomada de tarefas entre filas, rejeição de finalização por um worker cujo prazo expirou, e sucesso e timeout em tarefas de mídia. Os testes exercitam a fila do Arkon com dados sintéticos. A integração com o CLIPS continua pendente.

O [piloto local do CLIPS](../pilots/clips/README.md) agora implementa a API, a fila e o simulador. Os testes pela API confirmaram deduplicação de 12 pedidos simultâneos, conclusão após uma falha temporária, encerramento após três falhas e recuperação de tarefas com prazo vencido.
