# Demo Genesis, SDR e CRM — 11/11/2026

Entrada local: http://127.0.0.1:8080 . Clique em **Entrar no piloto**. A compilação de demonstração abre a empresa fictícia Alfa como administrador, exclusivamente no runtime local explicitamente habilitado. A interface normal continua exigindo o código do piloto.

## Roteiro

1. Abra Genesis. Confira os atalhos SDR, CRM e Minha empresa.
2. Escreva um pedido e clique em Preparar com meu time. O deepH executa `contexto > sdr + crm > revisor`, passando os resultados entre especialistas. O provedor HTTP local usa o cliente OpenAI do SDK do SDR e o modelo configurado. O contexto publicado da empresa acompanha o pedido.
3. Abra Conversas. A conversa **Demo Genesis Oficina Horizonte** já contém o teste de IA real e memória. Crie uma conversa de teste para repetir o atendimento.
4. Abra CRM. A interface consulta o CRMGO, que resolve a instalação pela tabela pivô e usa o SDK oficial do Clickmax. Workspace autorizado: **[DEV] Laboratório de testes**, slug codehall.
5. No CRM, cadastre um contato fictício e abra sua conversa. Quando a Bia registrar empresa e objetivo, publica a qualificação e o worker cria uma oportunidade no destino configurado, **Self Booking → Qualificado**.

## Evidências desta execução

- Testes `go test ./...` do SDR Next passaram, incluindo proteção das configurações locais e autenticação da rota Genesis.
- Build TypeScript/Vite aprovado.
- Execução real deepH com quatro agentes concluída.
- Workers de contexto e execução online, modelo `gpt-5.4-mini`, resposta real e memória verificadas pela API.
- Contato fictício no Clickmax DEV: `b0395c7a-eb15-4cba-8122-aced1bb61436`.
- Card confirmado pelo worker: `8f9e3ec7-00b8-423a-8f56-b3eb80be6f81`, entrega `done`.
- Navegador local indisponível nas configurações do Codex; inspeção visual interativa pendente.

## Limites da demo

O Genesis prepara um plano. Ainda não constrói código, publica mudanças nem aplica esse plano ao CRM. O atendimento e a criação da oportunidade são executados pelo fluxo existente Bia → CRMGO → Clickmax. As respostas aparecem no canal de teste; WhatsApp real não foi ativado. Remix real continua pendente. Nesta consolidação, o portal arkom-dash já integra a demo em `/demo`; consulte o README da raiz. O link é local a este computador.

As execuções Genesis são exibidas durante a sessão do processo e seus relatórios ficam em arquivos privados. Não é uma fila durável de construção. Esta demo usa uma única execução Genesis por vez.

## Operação local

Nesta consolidação, use [o roteiro da raiz](../../../docs/EXECUTAR.md) e `scripts/demo.py`. O launcher antigo era específico do computador de origem e não faz parte desta publicação. As evidências acima descrevem o teste original, não dados incluídos no repositório.
