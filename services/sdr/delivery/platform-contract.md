# Contrato do piloto · etapa 0.7

O cliente personaliza a interface no Lovable. A interface envia pedidos autenticados para a API Go; os workers de contexto e execução, o banco e a auditoria permanecem no servidor novo. O contrato público está em `platform-openapi.json` e o cliente TypeScript em `src/platform-api.ts` no pacote da interface.

Base HTTPS: https://24.199.100.186/sdr-next

OpenAPI público: https://24.199.100.186/sdr-next/v1/platform/openapi.json

## Controle do cliente

- Conhecimento do negócio: fontes, ofertas, regras, rascunho, publicação e recuperação de versões na tela existente.
- Automações: nomes e campos dos fluxos, etapas, condições, passagem de resultados entre etapas, ferramentas permitidas, perfis que executam e perfis que aprovam. Administrador salva rascunhos, testa e publica.
- Acionamento pelo atendimento: condições sobre fatos conhecidos e preenchimento automático dos campos. Vem desativado. Quando habilitado, ocorre após uma resposta aceita do SDR; pausa humana e opt-out impedem novos acionamentos. Uma vez por conversa/versão, ou quando os valores das condições mudam, conforme a configuração.
- Execuções: testar sem efeitos, solicitar aplicação, acompanhar etapas e aprovações, pausar, retomar, cancelar, repetir falhas transitórias e exportar. A API retorna `allowed_actions` conforme papel e estado.
- A aparência e a organização das telas podem ser alteradas no Lovable usando a mesma API. Uma funcionalidade nova fora do catálogo depende de um novo adaptador no servidor.

## Ferramentas implementadas

`business.lookup` consulta a base publicada e autorizada para a solução. `offer.prepare` calcula um rascunho de proposta com preços publicados; não envia nem assina a proposta. `conversation.note` registra nota interna. `conversation.pause` pausa a automação da conversa. Não há chamadas HTTP arbitrárias, execução de código enviado pelo cliente ou envio externo de propostas.

## Pedidos e versões

1. `GET /v1/platform/capabilities` fornece catálogo, campos e capacidades do perfil. `GET /v1/platform/configuration` fornece rascunho, versão publicada e histórico.
2. `POST /v1/platform/configuration/draft` salva inclusive rascunhos incompletos dentro dos limites e retorna `validation_issues`. `validate` verifica sem efeitos. `publish` exige configuração válida. `restore` recupera uma versão como nova publicação. Escritas exigem `expected_revision`, `reason` e `Idempotency-Key`.
3. `POST /v1/platform/executions` recebe `workflow_id`, `mode` (`preview` ou `apply`), `source` (`draft` ou `published`) e `input` (valores de texto). Rascunho só admite preview do administrador, com `expected_configuration_revision`. A interface envia `expected_configuration_version` nos fluxos publicados.
4. A resposta 202 contém a execução. Consultar `GET /v1/platform/executions/{id}` e `events?after_seq=N`; não repetir um pedido com uma chave nova em caso de resposta incerta. Reenviar a mesma chave e corpo confirma o pedido original.
5. `POST /v1/platform/executions/{id}/actions` usa `kind`, `expected_revision`, `reason` e chave própria. Aprovação vale só para a etapa atual, por 15 minutos. Resultado privado anterior a pausa/cancelamento/expiração é rejeitado.
6. `GET /v1/platform/executions/{id}/export` exporta dados da execução, configuração congelada, contexto e eventos da própria empresa. Não inclui credenciais ou concessões internas dos workers.

O preview roda no worker e persiste seu histórico, mas não registra notas nem pausa conversas. Cancelar/pausar interrompe etapas pendentes; não desfaz etapas concluídas. Mudança publicada do contexto cancela pedidos pendentes. Mudança de um fluxo/ferramenta cancela pedidos pendentes afetados. Resultados, efeitos e auditoria são gravados na mesma transação.

## Identidade e Remix

O piloto usa `POST /__test/ui/login` com empresa, perfil e código recebido separadamente. A sessão opaca dura uma hora e fica apenas na memória da interface. Empresa e perfil vêm da sessão, não do corpo do pedido. Viewer consulta, operador executa fluxos autorizados, administrador configura. Aprovação segue os perfis da ferramenta, inclusive quando o solicitante é administrador.

Remix copia a interface. Não cria empresa, não copia sessão, não concede permissão e não copia chave OpenAI/WhatsApp. As duas empresas fictícias já existem no backend. Provisionamento comercial e autenticação definitiva ainda precisam ser construídos.

## Limites e escopo

16 ferramentas, 12 fluxos, 8 etapas por fluxo, 12 campos por fluxo, 32 KB de configuração, 100 versões, 200 execuções por empresa nesta fase. Até 60 comandos e 300 leituras por minuto por usuário. Listagem paginada: `limit` de 1 a 100 e `before_seq`. Histórico de eventos usa `after_seq`. Não há mecanismo de limpeza/arquivamento do limite de execuções nesta entrega.

O worker de execução atual processa respostas de IA e ações do catálogo em filas distintas no mesmo processo. O contexto de conversa continua no worker de contexto. As ações do catálogo são determinísticas; não consomem OpenAI. A IA real permanece no chat de teste. A etapa 0.8 liga conversas reais de texto ao mesmo processamento, mediante pareamento e ativação explícita de até três contatos por empresa. Conversas fictícias ficam separadas do transporte real. Veja docs/WHATSAPP.md. Atendimento e Marketing têm escopo de contexto, mas seus motores específicos não foram construídos.

Supabase atual, SDR Go original e serviços WhatsApp existentes ficam fora desta atualização. Persistência é SQLite transacional exclusivo do piloto, não comprovação de escala de produção. Builds e testes de API não substituem validação visual num Remix real.

## Mídias e agendamento · 0.10

O catálogo inclui `media.send` (conversation_id, media_id, caption opcional). `POST /v1/sdr/media` prepara arquivo reutilizável da empresa sem assumir conversa; a rota por conversa preserva seu vínculo. `not_before` agenda execuções apply no Go por até sete dias. A ferramenta só enfileira: consultar a mensagem por ID para entrega e usar a rota `/cancel` antes do envio começar. Preview não envia. Pausa, nova entrada, opt-out e alterações de configuração/negócio invalidam o pedido anterior. Veja [contrato de fluxos de mídia](../docs/FLUXOS-DE-MIDIA.md) para parâmetros, exemplo Lovable, permissões e limites.
