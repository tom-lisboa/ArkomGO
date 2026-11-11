# IA de voz por empresa

Em **WhatsApp → IA de voz no WhatsApp**, o administrador cadastra o perfil de voz e as credenciais da própria empresa. O SDR usa esse perfil e essa chave OpenAI em cada ligação. A tela de voz é independente da conexão de texto por QR Code.

## Configurar pela primeira vez

1. Na conta Twilio da empresa, tenha um remetente WhatsApp ativo, uma TwiML App vinculada ao remetente e um template de WhatsApp aprovado do tipo **Call to action → Voice Call Request**, sem variáveis. Copie os SIDs da conta (AC), do remetente (XE) e do template (HX). [WhatsApp Business Calling na Twilio](https://www.twilio.com/docs/voice/whatsapp-business-calling)
2. No painel, preencha os SIDs, o Auth Token da mesma conta Twilio e a chave OpenAI da empresa com acesso ao modelo Realtime selecionado. Configure o nome, a abertura, as instruções, a voz e a duração. Salve. Os dois segredos ficam criptografados no servidor. Para editar outros campos depois, deixe as chaves vazias.
3. Copie **Webhook de mensagens** para o campo de callback de mensagens do remetente, com método **POST**. A confirmação de permissão chega por esse webhook. Copie **Voice Request URL da TwiML App** para a aplicação de voz, também com **POST**. Use um remetente Twilio dedicado a esse fluxo se outro sistema já usar o callback de mensagens.
4. Clique em **Validar e ativar ligações**. O SDR confere a configuração do remetente, o webhook, a aprovação do template e o acesso ao modelo. Cadastrar credenciais ou validar a conexão não envia mensagens nem liga.

## Solicitar uma ligação

O administrador pode informar um número próprio de teste diferente do remetente e clicar em **Solicitar ligação de teste**. Administradores e operadores também podem escolher uma conversa WhatsApp autorizada e com automação ativa. No piloto, cada contato pode receber um pedido em 24 horas e cada empresa pode solicitar até 20 no período.

A solicitação fica na fila. O WhatsApp mostra o botão nativo de autorização. A IA só liga depois do aceite registrado pela Twilio, dentro de 15 minutos, ou quando a Twilio confirma que o contato já concedeu permissão permanente. Em caso de recusa ou expiração, o pedido termina. Quando a equipe assume uma conversa, o SDR invalida o pedido pendente e interrompe a IA que estiver falando nessa conversa. O histórico de ligações mostra estados e falhas, sem gravar áudio ou transcrição. [Permissão permanente na Twilio](https://www.twilio.com/docs/api/errors/37010)

A primeira versão atende ligações de saída iniciadas pelo painel. A IA usa as instruções salvas e pode ler as últimas mensagens entregues da conversa para ter contexto. A conexão Realtime utiliza a chave cadastrada pela própria empresa. [Sessões Realtime da OpenAI](https://developers.openai.com/api/docs/guides/realtime-conversations)

## Ativação do ambiente

No processo da API do SDR produto, defina `SDR_VOICE_ENABLED=true`, `SDR_VOICE_PUBLIC_URL` com a URL HTTPS pública do SDR (com `/sdr-next` se esse for o prefixo publicado) e `SDR_VOICE_KEY_FILE` com o caminho de um arquivo privado com uma chave de criptografia de 32 bytes em Base64. Gere a chave do ambiente uma vez, preserve-a nos backups e mantenha o arquivo acessível apenas ao serviço. As chaves Twilio e OpenAI dos clientes são cadastradas pelo painel.

O proxy precisa encaminhar `/v1/sdr/voice/twilio/*` incluindo o upgrade WebSocket de `/stream/`. A URL assinada pela Twilio deve corresponder à URL pública da configuração. A API exige armazenamento SQLite durável. Com a flag desligada, a tela de voz permanece oculta.

O contrato de administração e chamada está no [OpenAPI](../platform-openapi.json). Os endpoints públicos da Twilio verificam a assinatura com o Auth Token da conta vinculada e validam a chamada ou a mensagem correspondente.
