# WhatsApp real · teste de texto e mídia

Esta etapa liga o gateway separado aos workers de mídia, contexto e execução. A interface continua personalizável pelo Lovable e não recebe chaves de provedor.

## Como ativar

1. Entre na empresa de teste como Administrador e abra WhatsApp.
2. Pareie um número que você controla por QR ou código. Espere o estado WhatsApp conectado.
3. Em Autorize o atendimento, informe de um a três **outros números** autorizados, com DDI e DDD. Use um contato por linha.
4. Clique Ativar para estes contatos e espere Configuração aplicada.
5. Para mídias, marque Permitir áudios, imagens e arquivos neste teste e aplique a configuração. De um dos números autorizados, envie uma nova mensagem de texto, áudio, imagem ou PDF para o número pareado. A conversa deve aparecer em Conversas como WhatsApp real. O SDR usa o negócio publicado e a memória dessa conversa.
6. Na conversa, clique Assumir atendimento ou Pausar Bia para impedir novas autorizações automáticas. A equipe pode responder pelo próprio painel quando assumir, inclusive anexando arquivos e esperando a preparação antes de enviar. Para encerrar, desative Atendimento real de texto.

O pareamento sozinho não ativa o atendimento. Conversas fictícias continuam funcionando separadamente. A entrada Enviar mensagem de teste não aceita conversas de WhatsApp real.

## Limites deste teste

Somente novas mensagens diretas recebidas após a ativação e dos contatos autorizados. Mídias dependem da permissão explícita do administrador. Grupos, histórico anterior, mensagens enviadas pela própria conta, visualização única, conteúdo efêmero e edições ficam excluídos. Áudio até 3 minutos, imagens e PDF são interpretados pelo worker; arquivos até 8 MB. Vídeo MP4 é permitido somente para envio. Veja MIDIAS.md. Atendimento humano é feito pelo painel; respostas feitas diretamente no aplicativo WhatsApp do celular ainda não são sincronizadas como uma tomada de controle no SDR.

Até três contatos autorizados, 100 conversas reais e 2.000 mensagens por empresa no piloto. O atendimento usa os exemplos publicados da empresa fictícia escolhida. Isso não é cadastro comercial automático de novos clientes.

Uma mensagem na fila ainda pode ser bloqueada por pausa, opt-out, nova entrada ou alteração do negócio. O gateway pede autorização ao backend imediatamente antes de enviar. Após essa autorização, o estado vira Em envio: uma pausa posterior não recolhe um pacote já encaminhado. Uma mensagem sem confirmação fica como Envio não confirmado e não é reenviada automaticamente; confira no celular antes de criar outra resposta. Enviada ao WhatsApp indica confirmação do servidor WhatsApp, não leitura ou entrega ao aparelho do destinatário.

## Contrato público

`GET /v1/sdr/whatsapp/messaging` retorna enabled, revision, test_phones, synced, last_sync, error_code e os limites. Viewer consulta. Somente admin altera com `POST`, usando enabled, test_phones, expected_revision, reason e Idempotency-Key. Ativação exige canal conectado. Desativar ou aplicar contatos cria uma nova sessão de teste, invalida trabalhos pendentes e não reprocessa histórico antigo.

As conversas reais usam os mesmos endpoints de conversa/mensagens/ações já utilizados pela interface. O campo channel distingue whatsapp de fake_whatsapp. Os estados reais de saída são queued, sending, sent, cancelled e uncertain. A consulta fica restrita à empresa da sessão.

## Dentro da nossa estrutura

O coordenador consulta mensagens no bridge privado. Eventos são persistidos no SDR e só depois confirmados no banco de transporte, por empresa e identificador. Repetição de uma confirmação não duplica a conversa ou a entrada. As filas e a memória do SDK Go são as mesmas do chat de teste.

Cada saída tem um identificador fixo e um conteúdo imutável. O bridge mantém a fila transacional no PostgreSQL exclusivo do gateway. Uma disputa de workers só permite uma retirada. O gateway valida a autorização no listener privado da API e chama Whatsmeow uma única vez, com identificador estável. Uma perda de confirmação ou reinício depois de uma retirada não devolve o envio à fila. O painel só marca Enviada após a confirmação registrada pelo transporte.

Nenhum webhook ou endpoint de worker fica público. Bancos, sessões e segredos continuam exclusivos da estrutura nova. Supabase e SDR Go original não são usados por esse caminho.

Preparação, retenção, lote misto de mídia/texto, falhas e contratos de anexos: veja MIDIAS.md.
