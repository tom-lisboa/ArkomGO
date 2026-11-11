# SDR Next · backend privado e interface Lovable

Piloto isolado da nova plataforma, com duas empresas fictícias, workers Go de contexto/execução e interface personalizável no Lovable. A aplicação de teste está em https://24.199.100.186/sdr-next/ .

Este repositório é **privado** e contém o backend. Para o cliente, encaminhar somente o ZIP da interface gerado a partir de `delivery/lovable-template`. O ZIP não inclui este backend, banco, códigos de acesso, sessões ou chaves dos provedores.

## Começar pelo teste

Siga [o roteiro do primeiro teste](docs/TESTAR.md). Acesso ao piloto exige o código da empresa/perfil, entregue separadamente. Os códigos locais ficam fora do Git e do pacote Lovable. Nunca devem ser anexados ao chat do Lovable.

O cliente pode editar conhecimento do negócio, ofertas, regras, fluxos, campos, condições e aprovações; salvar rascunhos, testar e publicar versões. Pela tela Execuções, pode solicitar processamento, acompanhar etapas e resultados, aprovar, pausar, retomar, cancelar e exportar conforme o perfil.

A IA é real nas conversas de teste. O catálogo atual consulta o negócio, prepara proposta em rascunho, registra nota interna e pausa a automação. Propostas não são enviadas. Gatilhos após respostas do SDR vêm desligados. O transporte WhatsApp de texto está implementado para até três contatos autorizados por empresa, mediante pareamento e ativação explícita do administrador. Veja [como ativar e os limites do teste](docs/WHATSAPP.md).

O primeiro Remix real ainda precisa ser importado e validado numa conta Lovable. Remix não cadastra uma nova empresa automaticamente. Identidade comercial, provisionamento de compradores, áudio/anexos no WhatsApp e arquivamento além dos limites do piloto são etapas pendentes.

## Componentes e contratos

Cadastro comum, implementado localmente e desativado por padrão: `SDR_DIRECTORY_FILE` ativa o adaptador de cliente/organização/pessoa e o limite de papel por produto. As sessões e os IDs locais continuam próprios; não há login único instalado. Consulte o [registro da etapa](/Users/tomlisboa/Desktop/Arkon/docs/plataforma-cadastro-comum.md). A instalação publicada e o SDR/BIA original não foram alterados.

- `main.go`, `storage.go` e `policies.go`: API, SQLite transacional exclusivo, autorização e auditoria.
- `business*.go`: núcleo compartilhado do negócio, rascunhos, publicação e recuperação de versões por empresa.
- `internal/contextworker` e `internal/executionworker`: gestão de contexto e execuções independentes do SDR original.
- `pkg/sdrsdk`: SDK Go com contratos internos, integração OpenAI e catálogo de ações.
- `platform*.go`: configuração versionada, fila persistente, aprovações, efeitos e histórico.
- `frontend`: interface cliente; `frontend/src/platform-api.ts` é o cliente das execuções.
- `delivery/lovable-template`: fontes revisados da interface para importar no Lovable.
- [Contrato de execuções](delivery/platform-contract.md), [contrato dos workers](delivery/workers-contract.md), [contrato do negócio](delivery/core-contract.md) e [OpenAPI público](platform-openapi.json).
- O motor de conexão WhatsApp tem repositório privado separado: https://github.com/tom-lisboa/sdr-whatsapp-engine . É uma cópia independente, sem sessões nem credenciais da instalação original.

## Verificação e pacote

Go 1.26 e Node 22. Os testes usam banco temporário e provedores simulados, sem acessar o servidor, Supabase ou OpenAI real.

```sh
go test -race ./...
go vet ./...
npm --prefix frontend ci --ignore-scripts --no-audit --no-fund
npm --prefix frontend run build
npm --prefix delivery/lovable-template ci --ignore-scripts --no-audit --no-fund
python3 tools/package_lovable.py
```

O último comando compila e gera o ZIP candidato versionado em `delivery`, com a interface, OpenAPI, roteiros e orientações ao Lovable. Ele preserva o ZIP estável e seu alias de distribuição; a candidata exige atualização/ativação do backend antes de ser oferecida aos testadores. Arquivos de dados, investigações, credenciais, binários e relatórios operacionais locais são excluídos do Git. A especificação pública também é servida em https://24.199.100.186/sdr-next/v1/platform/openapi.json .

O GitHub Actions repete os testes/builds a cada atualização; não há implantação automática nem credenciais do servidor no GitHub. Reconstruir código a partir do repositório não recupera dados ou segredos: eles têm cópias de segurança separadas.

`python3 tools/check_pilot.py` confere disponibilidade HTTPS, arquivos da interface, contrato público, exigência de sessão e origens permitidas. Com `--with-pilot-access`, usa os códigos locais de Consulta para conferir os workers e o isolamento das empresas, sem solicitar IA ou enviar WhatsApp. Esse modo exige o arquivo privado local; não deve ser configurado no GitHub Actions.

## Isolamento e estado validado

A etapa 0.8 atualiza somente os processos novos da API, contexto/execução e bridge/gateway WhatsApp; o PostgreSQL exclusivo não é reiniciado. Os serviços originais `arkom-bia-*` e a fonte Lumi original não são modificados. Esta etapa não acessou o Supabase.

Na etapa anterior, uma resposta real de IA acionou a proposta da Beta. Na etapa 0.8, os testes incluem transporte de texto, duplicidade, isolamento, concorrência de retirada no PostgreSQL temporário, pausa, alteração de contexto, reinício, envio não confirmado e texto Unicode. As verificações no servidor conferem disponibilidade, permissões e configuração desativada por padrão, sem enviar mensagens reais. A validação ponta a ponta com celular continua pendente do pareamento e da ativação pelo responsável. Relatórios operacionais ficam locais, fora do Git e do pacote do cliente.

A persistência SQLite é exclusiva do piloto e não comprova escala de produção. A API impõe limites por perfil/empresa, inclusive até 40 conversas de teste, 200 execuções e 100 versões de configuração por empresa. Preview mantém o histórico do pedido sem aplicar notas/pausas; cancelar não desfaz etapas concluídas.

O contrato 0.10 inclui a capacidade `media.send` para fluxos criados pelo cliente no Lovable, arquivos reutilizáveis da empresa, agendamento durável e consulta/cancelamento de entrega. Veja [Fluxos de mídia](docs/FLUXOS-DE-MIDIA.md). Não acrescenta uma tela obrigatória nem ativa automações existentes.

A página hospedada em `/sdr-next/` exige `npm run build:pilot --prefix frontend`; o verificador rejeita assets fora desse prefixo. O pacote Lovable usa a raiz do projeto e mantém a compilação própria.

Monitoramento 0.11: [worker, contadores e sequências](docs/MONITORAMENTO.md). Painel da nossa operação separado do Remix; não inclui conteúdo das conversas.

Etapa 0.12, implementada localmente e desativada por padrão: [dados por cliente, GraphQL e exportação](docs/DADOS-DO-CLIENTE.md). Inclui a tela Meus dados, consultas com a empresa fixada pela sessão, projeção de métricas da própria empresa e worker Go de exportação em segundo plano no processo da API. Requer ativação explícita somente na instalação nova; não foi implantada no servidor nem altera os acessos do pacote 0.11.1 já distribuído.

Etapa candidata 0.13: [worker de agenda, multiagendas, Google OAuth e ferramentas do SDR](docs/AGENDAS.md). Agenda própria e adaptador Google implementados/testados localmente; configuração OAuth/domínio e homologação real pendentes. Novo processo `-worker=calendar`, sem credenciais OpenAI. Rotas e ferramentas só ficam disponíveis com ativação explícita na instalação nova. Nenhum serviço em operação foi alterado.

Etapa candidata de voz: [cadastro e chamadas de WhatsApp por empresa](docs/VOZ.md). O administrador conecta o remetente Twilio e a chave OpenAI da própria empresa e configura o perfil de voz. A capacidade exige ativação no ambiente do produto.
