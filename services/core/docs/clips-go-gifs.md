# Geração de GIFs no Clips Go

Em homologação, a opção **Gerar GIFs** abre uma tela autenticada. O cliente pode salvar, trocar ou remover a chave da OpenAI. A chave fica cifrada por conta e a interface recebe apenas a confirmação de que existe uma chave salva. A opção **Gerar com brinde** aparece enquanto a conta tem saldo e prazo ativo.

O pedido entra em uma fila própria do worker do Clips Go. A fila renderiza GIFs de 512 × 512 px com 9 quadros de 200 ms via GPT Image 2.6 Flare. O pedido não bloqueia a interface. O cliente acompanha o status e pode visualizar ou baixar o arquivo concluído. O download exige sessão da mesma conta.

## Ofertas pontuais

No host de homologação, abra a pasta do release e execute a operação abaixo com o e-mail do cliente, saldo e vencimento desejados. A operação substitui o saldo e a validade anteriores daquela conta.

```sh
cd /opt/clips-go-homolog/current
sudo docker compose run --rm -T --entrypoint /usr/local/bin/clips-go migrate -hosted-role gif-grant <<'JSON'
{"email":"cliente@example.com","remaining":10,"expires_at":"2026-12-01T23:59:00-04:00"}
JSON
```

Cada pedido aceito reserva e consome uma geração. Só um pedido por conta pode ficar pendente. Falhas e interrupções não são repetidas automaticamente, pois a OpenAI pode já ter cobrado a chamada. Para revogar pedidos futuros, defina `remaining` como zero. Os pedidos já aceitos conservam a fonte de cobrança escolhida no envio.

## Segredos de operação

- `/etc/clips-go-homolog/gif-shared/seal` contém a chave de cifragem em Base64. API e worker precisam desse mesmo arquivo. Preserve-o separadamente do backup do banco para poder recuperar as chaves de clientes.
- `/etc/clips-go-homolog/gif-provider/openai` contém a chave da plataforma, montada apenas no worker. Ofertas usam essa chave pelo servidor.

## Instalações Remix

O build `clips-remix` mostra **Gerar GIFs** no menu. A chave é cadastrada pela
sessão da conta no domínio verificado. O Remix baixa a prévia e o arquivo
pela API autenticada e usa uma URL temporária no navegador, sem credenciais na URL.

Para publicar no projeto Lovable de um cliente, registre a origem HTTPS
verificada e gere um pacote atualizado para a instalação. O pacote contém
somente a configuração pública da instalação. A chave de geração é
cadastrada na tela do Clips após a entrada. Veja o [roteiro de publicação
do Remix](plataforma-entrada-remix.md#preparação-pela-equipe).

A verificação local usa duas contas de organizações distintas e credenciais
fictícias. Confere a seleção da chave no worker, o débito independente de
brindes e a recusa de downloads cruzados. O teste de navegador cobre
cadastro e remoção de chave, prévia e download no domínio do Remix.
