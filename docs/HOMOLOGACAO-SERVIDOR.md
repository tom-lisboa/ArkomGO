# ArkomGO em homologação no servidor

A homologação roda no servidor da Arkom com acesso por SSH. As empresas Alfa e
Beta são fictícias. A interface Flutter abre a BIA, a Lia, o CLIPS, a Maia, o
FinanceAI, o CRM e o estúdio Genesis. O diretório de homologação e os processos
do systemd têm nomes próprios.

## Acesso

Execute em um computador com acesso SSH ao servidor e abra
[ArkomGO](http://127.0.0.1:13007/demo) enquanto o túnel estiver ativo.

```sh
bash scripts/server/connect-homolog.sh usuario@servidor ~/.ssh/arkom_dev
```

A equipe usa a mesma porta local 13007 para a ArkomGO. As outras portas do
túnel permitem abrir a Maia, o FinanceAI e a autenticação da Maia dentro do
portal. O túnel padrão não encaminha bancos de dados.

Entre com `alfa@arkom.test` ou `beta@arkom.test`. Consulte a senha de
cada conta pelo terminal com acesso administrativo ao servidor. A sessão
dura uma hora. Use **Sair da conta** para alternar de empresa.

```sh
bash scripts/server/read-homolog-login.sh usuario@servidor ~/.ssh/arkom_dev alfa
bash scripts/server/read-homolog-login.sh usuario@servidor ~/.ssh/arkom_dev beta
```

## Serviços

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
systemctl list-units 'arkomgo-homolog*'
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
provisionados para Alfa e Beta. A origem do portal nesses artefatos é
`http://127.0.0.1:13007`.

A versão hospedada usa contas de homologação com login obrigatório. A
liberação para clientes requer autenticação comercial, provisionamento por
empresa e publicação HTTPS da plataforma e dos agentes. O domínio
`sdk.arkom.ai` atende a documentação e os serviços SDK existentes.

O primeiro build Go em um servidor pequeno pode precisar preparar o cache
da biblioteca padrão. Execute `sudo bash scripts/server/warm-go-cache.sh`
para gerar esse cache sem usar código de clientes. Cada construção recebe
uma cópia privada do cache base.
