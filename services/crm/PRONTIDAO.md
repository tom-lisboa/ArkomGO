# Prontidão para publicar o CRMGO

## O que já passou pelo Codehall

No piloto dev, a tabela pivô resolveu a empresa, a instalação da Bia e o
workspace correto. A interface consultou contatos e selecionou leads para
oportunidades. Foram validados pipelines e etapas, criação e edição de
cards, ganho e perda, motivos restritos por pipeline e filtros de status e
motivo. Um evento de qualificação da Bia também criou um card real em um
teste isolado.

## O que falta, em ordem de entrega

| Etapa | O que precisa ficar pronto | Como validar |
| --- | --- | --- |
| 1. Cadastro real | **Concluído no Codehall dev.** Link de captação dedicado configurado na rota. | Contato criado pela API do CRM Arkom, qualificação processada pela Bia dev e um único card confirmado no Clickmax após reenvio do evento. |
| 2. Instalação por cliente | Provisionar organização, instalação, credencial da Bia, workspace e destino do card. Validar que a chave e o link de captação pertencem ao workspace configurado. | Habilitar duas empresas de teste em workspaces distintos. Cada uma cadastra, consulta e altera só os próprios dados. Validar também suspensão e troca de credencial. |
| 3. Interface do cliente | Publicar um Remix do Lovable ligado a um backend de homologação. Integrar sessão, papéis e configuração por empresa. | Entrar como administrador, operador e consulta. Confirmar os controles de cada papel e que o navegador recebe apenas a sessão do usuário. |
| 4. Operação | Definir implantação, migrações, credenciais por ambiente e monitoramento da fila. Criar um procedimento para reconciliar entregas incertas antes de reprocessar. | Reiniciar o worker durante um teste, verificar os estados da fila e recuperar a entrega sem duplicar card. |
| 5. Edição de contatos | O SDK e o MCP consultados não expõem atualização de nome, e-mail e telefone por ID. A interface oferece um atalho para o painel do Clickmax. | Decidir se o atalho atende à primeira versão. Para edição integral no CRM, aguardar ou obter uma operação oficial do Clickmax e testar atualização por ID. |

## Evidência do cadastro real

A rota dev usou o link de captação **CRMGO DEV** no Codehall. A API do CRM
criou o [contato de teste](https://app.clickmax.io/codehall/leads/8f25a928-2cef-4df4-b65a-8e210944880e)
e vinculou a conversa na Bia. A Bia processou uma mensagem fictícia pelos
workers de contexto e execução. A resposta do modelo foi simulada para
que o teste verificasse a integração de forma reproduzível. Captação,
roteamento, gravação e leitura no Clickmax foram reais.

O mesmo evento foi publicado duas vezes. O worker registrou a entrega
como concluída e a consulta do contato retornou exatamente um card, ID
`162d99f6-17ca-43c9-bd87-fcacefac6dc6`, em **Self Booking → Qualificado**.

A publicação para clientes depende da homologação multiempresa e do
Remix com a sessão de um cliente de teste.
