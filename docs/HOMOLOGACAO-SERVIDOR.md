# ArkomGO em homologação no servidor

A homologação roda no servidor da Arkom. As empresas Alfa e
Beta são fictícias. A interface Flutter abre a BIA, a Lia, o CLIPS, a Maia, o
FinanceAI, o CRM e o estúdio Genesis. O diretório de homologação e os processos
do systemd têm nomes próprios.

## Acesso

Abra a [ArkomGO](https://sdk.arkom.ai/arkomgo/) no navegador. O Caddy
encaminha essa rota ao serviço `arkomgo-public.service`, que escuta na
porta 13008 de loopback. Para tarefas administrativas, o acesso por túnel
também está disponível em [127.0.0.1:13007/demo](http://127.0.0.1:13007/demo).

```sh
bash scripts/server/connect-homolog.sh usuario@servidor ~/.ssh/arkom_dev
```

Entre com `alfa@arkom.test` ou `beta@arkom.test`. Consulte a senha de
cada conta pelo terminal com acesso administrativo ao servidor. A sessão
dura uma hora. Use **Sair da conta** para alternar de empresa.

```sh
bash scripts/server/read-homolog-login.sh usuario@servidor ~/.ssh/arkom_dev alfa
bash scripts/server/read-homolog-login.sh usuario@servidor ~/.ssh/arkom_dev beta
```

## Cadastro de empresas

Abra [Criar conta](https://sdk.arkom.ai/arkomgo/signup) e preencha nome,
atividade, fuso horário, e-mail e senha. O cadastro prepara a empresa em
segundo plano. A entrada é liberada quando a Maia e o FinanceAI têm
organizações próprias e o canal de WhatsApp está provisionado. O portal
publica o contexto do cadastro para a BIA, configura o CRM nativo e cria
uma agenda com aprovação. Projetos Genesis, mídia, conversas e contatos
começam vazios. O CRM das novas contas usa a base de homologação da Arkom.

A empresa pareia seu número antes de usar o WhatsApp. O FinanceAI usa a
conta bancária simulada de cada empresa. O formulário de homologação
usa e-mail como identificação local. Verificação de e-mail e recuperação
de senha por e-mail fazem parte da preparação para contas comerciais.

### Implantação do cadastro

Com Maia e FinanceAI da homologação instalados, execute
`sudo bash scripts/server/install-signup-db.sh`. O script prepara um
login SQL restrito em cada banco. O pacote de release instala
`signup/provision.py`, usado por `arkomgo-homolog@api.service` quando as
duas credenciais estão disponíveis. A API da Maia precisa ser compilada
com a integração FinanceAI de `scripts/multipropriedades/finance-registry.go`
e `finance-http.go`. O cadastro adiciona os vínculos de cada empresa a
`maia/finance/onboarded` sem precisar reiniciar a Maia. Atualize também
`scripts/financeai/web.py` na instalação do FinanceAI para que a sessão do
novo cliente entre pela sua própria instalação. Senhas, vínculos e
credenciais de serviço ficam na estrutura privada da homologação.

## Serviços

- `arkomgo-public.service` serve os builds HTTPS da plataforma e dos agentes.
- `arkomgo-homolog@*.service` supervisiona o portal, a API, a BIA, a Lia,
  o WhatsApp, a mídia, o CLIPS e o CRM.
- `arkomgo-homolog-finance.service` inicia o FinanceAI e seus seis workers em
  modo simulado para banco, fiscal e IA.
- `arkomgo-homolog-maia@*.service` supervisiona a API, o frontend de
  homologação e a captação da Maia. O Supabase de teste usa o projeto Docker
  `arkom-multi-homolog` e tem autenticação e banco próprios.
- O Genesis usa a Responses API e o deepH. O executor Docker limita os
  comandos a testes Go, compilação Svelte e execução da prévia, com rede
  desabilitada dentro dos contêineres de construção.
- O CRM da Alfa usa o workspace DEV do Clickmax. O CRM da Beta usa uma
  base de homologação própria, com o funil Matrículas e integração com a
  BIA da Beta. Cada empresa recebe seu QR do WhatsApp para configurar um
  número e autorizar contatos no painel.

Para conferir os processos e a versão ativa no servidor:

```sh
systemctl list-units 'arkomgo*'
readlink -f /opt/arkomgo-homolog/current
curl -fsS http://127.0.0.1:13007/__arkom/ready
```

## Instalação e estado

Depois de compilar Flutter e BIA, gere os binários e monte o pacote:

```sh
python3 scripts/server/build-homolog.py ~/Desktop/sdr-whatsapp-engine .local/arkomgo-release
```

No host Linux, instale as dependências Svelte com `npm ci --ignore-scripts`
dentro da pasta `genesis-frontend` do pacote. O instalador em
`scripts/server/install-homolog.sh` recebe um diretório de
release com os binários Linux amd64, Flutter compilado, build da BIA, toolchain
Svelte com dependências Linux, workspace deepH, migrações do WhatsApp e os
arquivos de serviço. A imagem do PostgreSQL é `postgres:17-bookworm`.
FFmpeg, Docker, as imagens Go e Node do executor e a credencial do provedor
já devem estar disponíveis no host.

As aplicações usam `/var/lib/arkomgo-homolog` e os volumes dedicados.
O instalador mantém credenciais em `/etc/arkomgo-homolog`. Os arquivos do
CRM precisam conter somente a configuração do workspace DEV. Maia e
FinanceAI usam também seus próprios artefatos compilados e vínculos
provisionados para Alfa e Beta. O gateway público usa a mesma API de homologação e os mesmos vínculos.
A documentação e os serviços do SDK têm suas próprias rotas no Caddy.

### Build do gateway HTTPS

Monte um release em `/opt/arkomgo-homolog/public/releases/` e aponte
`/opt/arkomgo-homolog/public/current` para ele. O release usa o binário
Linux amd64 `bia` e quatro diretórios de frontend.

- `flutter` usa `flutter build web --release --base-href /arkomgo/genesis-flutter/ --no-web-resources-cdn`.
- `bia-web` usa a base Vite `/arkomgo/agents/bia/`.
- `finance-web` usa o frontend preparado por `scripts/financeai/run.py` com
  `scripts/financeai/entry.tsx` e a base Vite `/arkomgo/agents/financeai/`.
- `maia-web` usa o `dist` de `node scripts/multipropriedades/build-hosted.mjs
  <checkout-da-maia> <staging-novo> <json-de-configuração>`. O JSON contém
  `PUBLISHABLE_KEY` do Supabase de homologação.

Instale `scripts/server/arkomgo-public.service` no systemd. Importe
`scripts/server/arkomgo-public.caddy` dentro do virtual host
`sdk.arkom.ai`. Valide a configuração do Caddy antes de recarregá-la.

O primeiro build Go em um servidor pequeno pode precisar preparar o cache
da biblioteca padrão. Execute `sudo bash scripts/server/warm-go-cache.sh`
para gerar esse cache sem usar código de clientes. Cada construção recebe
uma cópia privada do cache base.
