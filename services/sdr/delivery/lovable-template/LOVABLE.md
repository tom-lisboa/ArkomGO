# Instruções para personalizar este SDR no Lovable

Este aplicativo é a interface do backend Go externo em https://sdk.arkom.ai/sdr-next . O cliente deve conseguir operar e personalizar o produto inteiramente pela interface do Lovable.

Leia `src/api.ts`, `src/platform-api.ts` e `platform-openapi.json`. A especificação pública também está em https://sdk.arkom.ai/sdr-next/v1/platform/openapi.json . A integração usa a sessão opaca do usuário, emitida pelo nosso backend após login. Ela não usa chave secreta de serviço no navegador. Empresa e permissões são verificadas no servidor.

Pode redesenhar marca, cores, navegação e componentes. Pode criar novos formulários e painéis que chamem os contratos existentes. Preserve Conhecimento do negócio, Conversas, Conectar WhatsApp, Automações e Execuções, incluindo rascunho/publicação, preview sem efeitos, aprovações, pausa/cancelamento, histórico e exportação. Mostre as ações retornadas em `allowed_actions`; o servidor continua sendo a autoridade. Preserve a mesma `Idempotency-Key` quando confirmar uma chamada cujo resultado ficou incerto.

Os dados do negócio, memória do atendimento, configurações publicadas, histórico e execução ficam no backend central. Não criar Supabase, Edge Functions, outro motor de IA, dados simulados substituindo respostas da API ou persistência desses dados em localStorage. Nunca colocar código de acesso, chave OpenAI, chave WhatsApp ou token interno de worker nos fontes/chat. O acesso do WhatsApp já é preparado no servidor após o login; o cliente só precisa parear seu celular.

O catálogo público informa as ferramentas existentes. Um fluxo combina essas ferramentas, campos, condições e resultados anteriores; não é código arbitrário executado no servidor. Se uma funcionalidade precisar de ferramenta nova, documente o contrato desejado para implementarmos o adaptador Go.

Este é um piloto de duas empresas fictícias. Remix não cadastra uma nova empresa nem autentica um usuário automaticamente. O transporte WhatsApp de texto depende de pareamento e ativação de até três contatos autorizados pelo administrador. Preserve src/WhatsAppMessaging.tsx e o endpoint /v1/sdr/whatsapp/messaging. Não habilitar respostas para todos os contatos nem tratar envios não confirmados como enviados. Veja WHATSAPP.md. Use os códigos separados apenas no formulário do aplicativo, sem anexá-los ao Lovable. Depois da importação, valide login, autorização, CORS e um Remix limpo antes de distribuir.

Este arquivo é uma orientação para a pessoa e para o chat do Lovable; não depende de reconhecimento automático pelo produto.


Na versão 0.11.0, a entrada é src/main.tsx, que carrega LabApp. Após o login, a primeira tela é WhatsApp. Ao adaptar uma cópia anterior, substitua sua entrada e os fluxos de conexão pelos deste pacote. Não mantenha assistentes antigos de escolha de provedor ou formulários de URL, API Key, instância e webhook. Não vincule esta área a funções legadas. Veja ATUALIZAR-FRONT.md.

Mídias: preserve src/MediaComposer.tsx, src/MediaAttachment.tsx e src/media-api.ts. O administrador controla media_enabled; upload não envia. Áudio é enviado sem legenda e anexos precisam estar ready, vinculados à conversa. Preserve downloads autenticados e repetições de upload com o mesmo arquivo/chave. Nunca colocar URLs privadas, segredos ou processamento de IA no navegador. Veja MIDIAS.md.

Fluxos criados pelo cliente: use `src/media-flows.ts` e `FLUXOS-DE-MIDIA.md`. `media.send` permite envio imediato ou agendado sem tela fixa. Não substituir configuração existente nem enviar ao importar um componente. A etapa concluída confirma fila; acompanhar entrega pelo message_id. Preparar arquivo reutilizável em `/v1/sdr/media` não exige assumir conversa. Anexos da rota de conversa continuam restritos àquela conversa.

Pacote 0.11: consulte NOVIDADES-0.11.md. A coleta de uso dos workers é interna da plataforma, não exige Edge Function nem acesso do Remix ao painel global. Não adicionar chaves internas ao cliente.


Etapa candidata 0.12: preserve `src/CustomerData.tsx` e `src/customer-api.ts`. O novo GraphQL é somente de consulta e determina a empresa pela sessão; não adicione seleção de empresa a esses pedidos. Exportação em lote exige administrador. Use as rotas `/v1/customer/exports` para preparar, consultar e baixar com autenticação; não publique arquivos nem tokens em URLs. Conheça a cobertura e os prazos em `DADOS-DO-CLIENTE.md`. Esta etapa exige atualização/ativação do backend novo e ainda não está disponível no piloto online.


Etapa candidata 0.13: preserve `src/calendar-api.ts` e `src/CalendarConsole.tsx`. Pode criar suas próprias telas e integrações com as rotas públicas de agenda, mantendo empresa e agente determinados pelo servidor. Horários vêm do backend, não de simulação no navegador. Acompanhe o pedido até o resultado; nunca apresente queued/waiting_approval como reserva confirmada. Contas Google e tokens ficam no servidor; o usuário usa o login seguro e seleciona suas agendas. Não criar Edge Functions para OAuth ou processamento. Leia AGENDAS.md para regras e limites; esta candidata ainda exige ativação e configuração do backend.

## Álbuns de Skills e Profissões

Todo Remix deste template já inclui a aba Álbuns. A biblioteca é estática e serve para descoberta. Preserve as fichas, imagens de demonstração e receitas ao personalizar o projeto. Só monte a interface operacional quando a empresa pedir no chat. Se pedirem um playbook junto, combine a skill com as escolhas da profissão.

- “Ligação por IA”, “voz” ou “chamada no WhatsApp”: leia `src/albums/receitas/ligacao-ia.md`, confira `platform-openapi.json` e reutilize os contratos e o componente de referência em `src/VoiceConsole.tsx`. A base para o cliente HTTP é https://sdk.arkom.ai/sdr-next.
- “Agendamento” ou “agenda”: leia `src/albums/receitas/agendamento.md` e confira a capacidade no ambiente. A ficha de agenda é de homologação.
- “Follow-up” ou “mídia programada”: leia `src/albums/receitas/follow-up.md` e use o motor de execuções da Arkom.
- “Atendimento no WhatsApp”: leia `src/albums/receitas/atendimento-whatsapp.md` e use a conexão e as conversas da empresa autenticada.
- “Clínica”: leia `src/albums/receitas/clinica.md` antes de desenhar a tela.
- “Advocacia” ou “escritório de advocacia”: leia `src/albums/receitas/advocacia.md` antes de desenhar a tela.

O modo Remix do Vite mantém a tela padrão de configuração de voz fora do WhatsApp. As receitas descrevem como adicionar uma tela sob demanda. Visitar os álbuns nunca ativa capacidades nem envia dados.

### CRM Arkom no piloto

A aba CRM em `src/CRMConsole.tsx` pode ser personalizada no Lovable. Use
a sessão já existente para consultar pipelines e cards, cadastrar contatos,
criar, editar e mover oportunidades, registrar ganho ou perda com motivo
e criar ou editar pipelines e etapas. Os caminhos
da interface são `/v1/sdr/crm/{operação}` no backend do piloto. A lista de
contatos tem busca e seleção para vincular uma oportunidade. As permissões
e o destino Clickmax são resolvidos pelo servidor. Preserve as chamadas ao
backend ao personalizar as telas, sem incluir credenciais do Clickmax ou
links de captação no projeto Lovable.

Em **Configurar motivos de perda**, o administrador cadastra a lista do
pipeline e pode restringir o fechamento aos motivos cadastrados.
