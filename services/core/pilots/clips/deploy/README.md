# CLIPS Go — infraestrutura de homologação publicada

Publicado em 06/11/2026. Release inicial `r-d01d7eca55da`. Endpoint de verificação [HTTPS do CLIPS Go](https://clipsgo-homolog.24-199-100-186.sslip.io/healthz).

## Escopo entregue

A instalação fica no servidor Arkom `24.199.100.186`, com um projeto Compose exclusivo `clips-go-homolog`. API Go, worker Go e PostgreSQL 17 têm containers, configuração, credenciais, rede e volume próprios. A API é publicada em HTTPS. As operações técnicas exigem um token reservado à equipe. A etapa 2 acrescenta o cadastro individual e a troca de uma sessão Supabase verificada por uma sessão Go. A interface oficial foi conectada no modo `clips-go`, com login público e dados privados neste mesmo hostname. Consulte o [contrato de acesso individual](../../../docs/clips-go-acesso-cliente.md) e o [escopo da interface de homologação](../../../docs/clips-go-interface-homologacao.md).

O servidor físico é compartilhado com outras homologações. Os limites configurados são 160 MiB para API, 320 MiB para worker e 160 MiB para Postgres, com CPU limitada por serviço. O FFmpeg usa uma thread e somente arquivos locais. O banco e o worker estão em uma rede Docker interna. Só a API tem a conexão necessária ao proxy local. As portas do banco ficam privadas. O token e a senha do banco são montados a partir de arquivos em `/etc/clips-go-homolog`, fora do release.

Nesta etapa, originais, legendas e MP4s ficam no PostgreSQL dedicado. Isso mantém o estado e os arquivos no mesmo snapshot transacional. O serviço HTTPS aceita requisições de até 8 MB. Use vídeos de até 7 MiB para reservar espaço ao formulário, com cortes de até 30 segundos. A fila admite até dez trabalhos pendentes e recusa novos envios quando a base ultrapassa 512 MiB. Essa recusa também inclui pedidos repetidos quando o limite já foi atingido. Vídeos longos e o uso de clientes em escala exigem armazenamento de objetos e uma política de retenção própria.

## Arquivos e operação

- Release e Compose — `/opt/clips-go-homolog/current`.
- Segredos — `/etc/clips-go-homolog/db-password` e `api-token`.
- Postgres — volume Docker `clips-go-homolog_clips_pg`.
- Proxy — `/etc/caddy/clips-go.caddy`, importado pelo Caddyfile existente.
- Backup — `/var/backups/clips-go-homolog`.
- Estado do monitor — `/var/lib/clips-go-homolog/monitor.json`.
- Evidências locais — `.local/clips-deployment`.

A URL usa um subdomínio de sslip.io que resolve para o IP Arkom e certificado público gerenciado pelo Caddy. Um domínio próprio pode substituir esse endereço numa etapa posterior.

```sh
ssh -i ~/.ssh/arkom_dev -o IdentitiesOnly=yes dev@24.199.100.186
sudo sh -c 'cd /opt/clips-go-homolog/current && docker compose ps'
sudo systemctl status clips-go-monitor.timer clips-go-backup.timer
sudo cat /var/lib/clips-go-homolog/monitor.json
```

`GET /healthz` verifica o banco e a presença recente do worker. `GET /ops/status` exige o token da equipe e informa os totais por estado. `/studio/session` preserva a sessão técnica do piloto e exige token da equipe. `/studio/jobs` aceita o acesso técnico ou uma sessão individual verificada. O acesso individual resolve a conta no servidor e ignora o cookie técnico do piloto. `POST /auth/session` verifica um access token no Auth central; `GET /auth/me` e `POST /auth/logout` consultam e encerram a sessão Go. A chave pública de origem fica em `/etc/clips-go-homolog/source-publishable-key`.

## Backups

O timer do servidor gera um dump consistente a cada seis horas, com retenção de aproximadamente sete dias. Vídeos e metadados entram no mesmo backup.

A cópia externa é puxada por SSH para este Mac, criptografada com AES-256-CBC/PBKDF2 e autenticada por HMAC-SHA256 antes de qualquer restauração. O agente `ai.arkom.clips-go-homolog.backup`, em `~/Library/LaunchAgents`, roda a cada seis horas enquanto o usuário está conectado e o Mac tem acesso à rede e à chave SSH. Os arquivos ficam em `.local/clips-deployment/offsite`, com retenção de aproximadamente 14 dias. A chave `backup-key` nessa pasta é necessária para recuperar a cópia externa e deve ser preservada.

A cópia externa depende da disponibilidade deste Mac. Para a operação de clientes, transferir essa rotina a um destino externo sempre disponível.

```sh
python3 pilots/clips/deploy/offsite-backup.py
python3 pilots/clips/deploy/verify-restore.py
```

## Monitoramento e verificações realizadas

O timer do servidor consulta a API, containers, fila, backup recente e espaço em disco a cada minuto. Falhas são registradas no journal e no JSON do monitor. Há rotação dos logs dos containers. Notificações externas para a equipe ainda precisam de um canal definido.

A verificação da publicação cobriu HTTPS com validação de certificado, recusa sem token, sessão de teste, pedido duplicado, renderização com FFmpeg e download completo e parcial. O backup externo foi autenticado, descriptografado e restaurado em um banco temporário. O hash SHA-256 do MP4 recuperado correspondeu ao arquivo baixado. A parada do worker provocou readiness 503 e falha no monitor; após o retorno do worker, a verificação voltou a passar.

Os IDs dos 25 containers já existentes foram comparados antes e depois da instalação. Todos foram mantidos. O Caddy recebeu somente o novo hostname, com cópia da configuração anterior e validação antes da recarga.

## Reprodução da publicação

A [entrada pelo Remix](../../../docs/plataforma-entrada-remix.md) foi preparada como ativação separada por `CLIPS_REMIX_ENABLED` e `CLIPS_REMIX_BACKEND`. O padrão permanece desativado. Seu pacote público contém somente API e instalação; os registros de domínio e de cliente são feitos pela equipe, sem credenciais técnicas no frontend.

O acesso próprio e os conectores de CLIPS, SOCIAL, Finance e BIA/SDR estão preparados para a próxima atualização, ainda pendente de acesso SSH. O [estado da integração](../../../docs/clips-go-integracao-backends.md) distingue o que foi validado localmente do que está publicado. `python3 pilots/clips/deploy/update.py --prepare-only` gera o pacote e seu hash sem contatar o servidor ou alterar o registro do release ativo.

`publish.py` constrói e instala a infraestrutura inicial após compilar o binário Linux. Ele recusa uma instalação com `current` já existente. `publish-https.py` adiciona o hostname e recusa substituir uma configuração de CLIPS já instalada. `update.py` faz atualizações posteriores: exige fila vazia, tira backup, cria outro release sobre a imagem anterior, aplica migração adicional e troca somente API e worker. O link ativo muda após readiness e comparação dos demais containers. Em falha, reinstala o release anterior preservando o volume e o schema compatível.

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o .local/clips-go-hosted ./pilots/clips
python3 pilots/clips/deploy/publish.py
python3 pilots/clips/deploy/publish-https.py
python3 pilots/clips/deploy/smoke.py
```

As imagens-base estão nas tags `debian:bookworm-slim` e `postgres:17-bookworm`. O release da aplicação tem identificação pelo hash do binário. Fixar digests de imagens e revisar atualizações de segurança faz parte da preparação para clientes.

A partir da publicação da interface, o release usa o hash combinado do binário e do frontend. `build-interface.py` gera o modo correto e registra o commit de origem; `update.py` inclui os assets na imagem e recusa o endereço do Auth de laboratório. `verify-public-interface.mjs` verifica a publicação sem autenticar como cliente. O frontend não recebe o token técnico.
