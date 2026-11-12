# Worker central do CRM

O Clickmax é a fonte dos dados comerciais. O PostgreSQL da plataforma
guarda o roteamento por cliente e o estado da entrega.

Execute `go run ./cmd/crm-worker` com `ARKOM_CRM_DATABASE_URL` apontando
para o PostgreSQL **dev** do diretório e do barramento da plataforma. Informe
o workspace dev ou a URL da API dedicada, conforme o modo abaixo.
O worker cria o schema `arkom_crm` na inicialização.

Para uma API de desenvolvimento dedicada, use uma chave `cxd_`. Se o
ambiente de teste for um workspace isolado na API pública, informe o UUID
verificado em `ARKOM_CRM_CLICKMAX_PUBLIC_DEV_WORKSPACE`. O worker usa o
endpoint padrão do SDK. Para uma API dedicada, informe a URL HTTPS em
`ARKOM_CRM_CLICKMAX_DEV_URL`.
Nesse modo, a chave `cxp_` só é usada para a rota cujo workspace coincide
com o UUID configurado e com o retornado por `Whoami`.

Cadastre uma rota em `arkom_crm.routes` com a organização, a instalação da
Bia, o ID da credencial de serviço da Bia, a referência do CRM e os IDs de
workspace, pipeline e etapa inicial. Em `key_env`, informe o nome da
variável do worker que guarda a chave, com prefixo `ARKOM_CRM_CLICKMAX_`.
Habilite a rota após conferir os vínculos. Resolva as entregas pendentes
antes de trocar o destino de uma instalação.

A Bia deve publicar em `POST /integration/v1/events` com a credencial da
instalação e o ID da organização em `X-Organization-ID`. No envelope,
use `source_solution` igual a `bia-sdr`, `event_type` igual a
`bia-sdr.crm.opportunity-qualified.v1` e o ID estável da oportunidade em
`subject`. Envie `bia_installation_id`, `clickmax_lead_id` e `title`
em `data`. Preserve o envelope inteiro em caso de repetição. O HTTP 202
confirma o enfileiramento. O estado `done` indica o ID do card criado.

O worker cria cards para contatos que já existem no Clickmax. Ele repete
entregas quando a configuração impede o envio ou quando recebe HTTP 429.
Uma rejeição explícita fica em `rejected`. Se o resultado da criação for
incerto, a entrega fica em `review`. Uma interrupção do worker pode deixar
a entrega em `creating`. Confira o card no Clickmax antes de reprocessar
entregas em qualquer um desses dois estados.

## Bia nova

Configure `SDR_CRM_DEV_ENABLED=true` e `SDR_CRM_ROUTES_FILE` no backend
SDR Next de desenvolvimento com um arquivo privado.
O JSON é um objeto indexado pelo ID local da organização na Bia. Cada
entrada contém `origin` (origem HTTPS do barramento), `organization_id`
(UUID central), `bia_installation_id`, `token` (credencial de serviço da
Bia no barramento) e `contacts` (mapa de ID de contato local para UUID do
contato Clickmax). Use a mesma instalação e o mesmo publicador cadastrados
na tabela pivô. A chave do Clickmax é usada pelo worker central.

No fluxo dev, a Bia qualifica o lead quando registra a empresa e o objetivo
declarados pelo contato, com ambos os dados ainda válidos. Ao qualificar
um contato vinculado ao Clickmax, grava um evento por conversa na mesma
transação da atualização da memória. O publicador repete o envio até
receber HTTP 202.

## CRM no piloto dev

O CRM usa a sessão da Bia e a rota da organização. A interface pode ser
personalizada no Lovable. O backend valida o perfil e mantém as credenciais
fora do navegador. Operadores cadastram contatos e criam, editam ou movem cards. A edição
do card cobre título, valor e probabilidade. Operadores e administradores
também registram ganho ou perda. Na perda, o motivo é obrigatório. Se o
pipeline restringir os motivos, a interface lista as opções do Clickmax.
Administradores podem cadastrar os motivos por pipeline e ativar a
restrição. A configuração é gravada no Clickmax pela tabela pivô. Administradores também criam
pipelines e editam o nome e a descrição do pipeline e o nome das etapas. O perfil de consulta
pode listar pipelines e cards.

Para executar a API local junto com o worker, configure
`ARKOM_CRM_DEV_LISTEN=127.0.0.1:8098` e use essa origem na configuração
da Bia. Para cadastro de contatos, coloque o link de captação do mesmo
workspace em uma variável com o nome de `key_env` seguido de
`_CAPTURE_URL`. O backend verifica se o ID retornado pode ser lido com a
chave daquele workspace antes de vincular a conversa de teste à Bia.

A listagem de contatos consulta o Clickmax pelo workspace da tabela pivô,
com busca por nome, e-mail ou telefone. A seleção da lista preenche o
contato da oportunidade. Configure `workspace_slug` na rota para exibir
o atalho de edição no Clickmax quando o usuário tiver acesso ao painel.
