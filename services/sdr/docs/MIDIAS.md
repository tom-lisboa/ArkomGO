# Worker de mídia · piloto 0.10

Áudios, imagens e PDF recebidos entram no mesmo contexto dos textos. O worker de mídia roda separado e não tem permissão para enviar WhatsApp, executar ferramentas ou alterar o negócio. Ele normaliza arquivos, transcreve áudios com o SDK Go da OpenAI e extrai referência visual/documental sem armazenar responses na OpenAI (`store=false` na leitura visual). O resultado é conteúdo do usuário, nunca instrução de sistema.

## Controle do cliente

Na tela WhatsApp, o administrador marca **Permitir áudios, imagens e arquivos neste teste** e aplica a configuração dos contatos. A opção inicia desligada. Até três contatos autorizados continuam sendo o limite. Alterar essa configuração encerra pendências do estado anterior. O cliente continua podendo personalizar a interface no Lovable; credenciais e processamento ficam no servidor.

Na conversa assumida ou pausada, administrador e operador podem anexar um arquivo, esperar ficar **Pronto para enviar** e clicar Enviar. Upload não envia nada. Áudio é preparado como nota de voz Ogg/Opus e enviado sem legenda. Imagem, PDF e vídeo aceitam legenda de até mil caracteres. São arquivos escolhidos pelo cliente; este recurso não cria uma voz sintética automaticamente nem gera imagens.

O contexto registra o tipo e nome dos anexos enviados pela equipe, sem inventar seu conteúdo. A interpretação automática descrita aqui se aplica às mídias recebidas.

Consulta pode visualizar os anexos da própria empresa e não pode anexar/enviar. Anexos enviados pela rota da conversa ficam vinculados àquela conversa. A rota `POST /v1/sdr/media` prepara arquivos reutilizáveis da empresa para `media.send`, sem exigir uma tela pronta: veja [Fluxos de mídia](FLUXOS-DE-MIDIA.md). Conhecer o identificador de outra empresa não concede acesso. Links de provedor, chaves e caminhos de disco não vão ao navegador.

## Lotes e falhas

- Texto: janela de silêncio de 5 segundos.
- Lote com mídia: 12 segundos após a última parte, com teto de agrupamento de 30 segundos.
- O agrupamento considera mensagens já entregues ao servidor; uma gravação ainda não enviada no celular não é detectada.
- Uma mídia ainda pendente bloqueia a execução mesmo após esse teto. O gateway registra a pendência antes de baixar o arquivo.
- Após uma leitura, aguarda ao menos 3 segundos para outra parte em trânsito e espera as demais mídias do lote. Resultados fora de ordem não mudam a ordem das mensagens.
- Após 120 segundos sem resultado, a falha é explícita e a conversa segue para a equipe. Não se inventa uma transcrição. Uma demora no download não consome tentativas de interpretação.
- Até duas tentativas de processamento; repetir a confirmação de um resultado não repete a chamada à IA nem duplica conteúdo.
- Opt-out transcrito pausa a conversa. Assumir/pausar enquanto o arquivo é lido não reativa a automação quando a leitura termina.

## Formatos e limites

Até **8 MB** por arquivo, **3 minutos** por áudio e 30 preparações por empresa/hora. Imagens PNG, JPEG, WebP e GIF são normalizadas; GIF usa o primeiro quadro. Leitura de PDF usa o arquivo como dado. MP4 H264/AAC é aceito para envio até 3 minutos; vídeo não é interpretado. Grupos, histórico anterior, visualização única, conteúdo efêmero e edições continuam excluídos.

Arquivos ficam em armazenamento privado da plataforma. O acesso expira em sete dias; blobs expirados são removidos nas próximas gravações e o cache de entrada é limpo ao receber novas mídias. Cada armazenamento limita a empresa a 256 MB e 500 arquivos. Metadados e textos interpretados permanecem no histórico do piloto. Até 1.000 registros de anexo no conjunto das duas empresas.

Uploads são lidos fora da trava global da API, com uma preparação de upload e até dois downloads públicos simultâneos. A fila, os resultados e os vínculos são duráveis. O envio fixa identificador, hash e tamanho do arquivo no pedido; o gateway confere bytes, prepara o upload ao WhatsApp e pede autorização novamente imediatamente antes de enviar. Pausa/revogação bloqueia uma nova autorização. Uma mensagem já autorizada pode concluir; resultado incerto não é reenviado automaticamente.

## Referências e modelos

Transcrição configurável por `SDR_MEDIA_AUDIO_MODEL` (padrão de instalação desta etapa: `gpt-transcribe`); visão por `SDR_MEDIA_VISION_MODEL` (`gpt-5.4-mini`). Somente o worker de execução e o de mídia recebem a credencial OpenAI de teste já autorizada. O worker de contexto não recebe essa credencial.

Documentação oficial conferida nesta implementação: [transcrição](https://developers.openai.com/api/docs/guides/speech-to-text), [imagens e visão](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses). A preparação de codec é local no worker; nenhuma URL arbitrária fornecida pelo cliente é baixada.
