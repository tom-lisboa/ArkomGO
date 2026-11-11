# Atualizar a interface do teste · versão 0.11.0

Este ZIP é a interface completa do piloto. A entrada correta é `src/main.tsx`, que renderiza `LabApp`. Depois do login, a primeira tela é WhatsApp.

## Pedido para o chat do Lovable

Atualize a interface deste projeto com os fontes do pacote 0.11.0. Use o src/main.tsx do pacote como entrada. A aplicação usa o backend externo já configurado em src/api.ts. Preserve o login por empresa/perfil e os clientes da API.

A tela WhatsApp deve ter o fluxo Conectar o número → Autorizar os contatos → Conversar e acompanhar. Use WhatsAppConnection.tsx e WhatsAppMessaging.tsx. O cliente pode usar QR Code ou código pelo número, acompanhar o estado, desconectar e, como administrador, ativar o teste para os contatos permitidos.

Substitua as telas antigas de Evolution, seleção de provedor, configuração de URL/API Key, instância e webhook por esse fluxo. Não renomeie esses campos para outro provedor: eles não pertencem à experiência nova. Não reutilize os hooks antigos de instâncias nem chamadas a Edge Functions nessa área. Não conectar Supabase, não adicionar segredos OpenAI/WhatsApp nem criar outro backend. O acesso ao canal é preparado na API depois do login.

O pacote não contém credenciais. Os códigos de acesso são inseridos somente no formulário do aplicativo. Preserve as restrições de perfil, revisão esperada e Idempotency-Key.

## Conferir após a atualização

1. Ao entrar, a tela inicial deve se chamar Seu WhatsApp.
2. Devem aparecer QR Code e Código pelo número, sem campos de URL, API Key, provedor, instância ou webhook.
3. A ativação de contatos é exclusiva do administrador; os demais perfis continuam limitados pelo backend.
4. A confirmação no celular continua necessária. Não há SMS de registro: o código de conexão é mostrado na tela.
5. Conversas, Conhecimento do negócio, Automações e Execuções continuam disponíveis conforme os contratos do piloto.

Ao importar sobre uma cópia anterior, confira qual arquivo a página realmente carrega. Copiar os componentes novos sem substituir a entrada antiga pode manter os formulários legados na tela.

A versão 0.9 inclui os componentes MediaComposer, MediaAttachment e media-api. Preserve-os e consulte MIDIAS.md.

Fluxos criados pelo cliente: use `src/media-flows.ts` e `FLUXOS-DE-MIDIA.md`. `media.send` permite envio imediato ou agendado sem tela fixa. Não substituir configuração existente nem enviar ao importar um componente. A etapa concluída confirma fila; acompanhar entrega pelo message_id. Preparar arquivo reutilizável em `/v1/sdr/media` não exige assumir conversa. Anexos da rota de conversa continuam restritos àquela conversa.

Pacote 0.11: consulte NOVIDADES-0.11.md. A coleta de uso dos workers é interna da plataforma, não exige Edge Function nem acesso do Remix ao painel global. Não adicionar chaves internas ao cliente.
