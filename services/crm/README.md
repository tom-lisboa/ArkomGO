# CRMGO

CRM da Arkom integrado ao Clickmax. O cliente trabalha pela interface Arkom,
que pode ser adaptada no Lovable. O Clickmax guarda os dados comerciais e o
serviço Go resolve a rota de cada empresa pela tabela pivô no PostgreSQL.

## Nesta versão

- API de CRM para contatos, pipelines, etapas e oportunidades, com acesso
  por organização e instalação.
- Worker que recebe a qualificação da Bia produto e cria a oportunidade no
  Clickmax, com deduplicação e registro do resultado.
- Componente React de CRM para incorporar ao piloto ou ao Lovable. Ele
  recebe a sessão da interface hospedeira e chama o backend autenticado da
  Bia. O componente não guarda credenciais do Clickmax.

Esta é uma base de desenvolvimento. O serviço local exige o PostgreSQL com
o diretório da plataforma e as credenciais de integração provisionados.
Confira a [configuração e o contrato da Bia](INTEGRACAO.md) e o
[que falta para publicar](PRONTIDAO.md).

## Verificar

```sh
go test ./...
npm --prefix frontend ci
npm --prefix frontend run check
```

Para executar o teste do worker e da rota, defina
`ARKOM_CRM_TEST_DATABASE_URL` apontando para um PostgreSQL **vazio e
descartável** antes de rodar `go test ./...`. O teste cria tabelas e dados
fictícios e simula as respostas do Clickmax.
