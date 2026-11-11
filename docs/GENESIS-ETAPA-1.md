# Genesis: primeira alteração executável em Go

## O que o cliente consegue fazer

Na tela Genesis, pedir: “Só encaminhe ao CRM quando souber a empresa, o objetivo e a quantidade de vendedores”. O time consulta as capacidades disponíveis, propõe a regra e prepara uma prévia com antes/depois. O cliente pode testar um contato fictício sem informar a quantidade de vendedores e depois preenchê-la. A primeira simulação aguarda o dado; a segunda fica pronta para o CRM.

Um administrador pode **Aprovar e ativar esta regra**. Os workers passam a receber os campos de qualificação no contexto, e o backend só enfileira a oportunidade quando todos os dados exigidos estiverem presentes e ainda válidos. É possível **Voltar à regra anterior**, criando uma nova versão auditada.

Publicar não reavalia automaticamente as conversas anteriores e não modifica eventos já enfileirados ou cards já criados. A regra vale quando o atendimento produzir novas avaliações de fatos. O envio ao Clickmax continua dependendo do vínculo do contato e da rota CRM da empresa.

## O que mudou no deepH

`packages/deeph/pkg/arkom` adiciona uma camada de contratos e construção limitada para Arkom:

- Catálogo versionado `catalog.json`, com serviço e contrato de cada capacidade confirmada.
- Especificação estruturada que exige `backend=go`, `deployment=arkom` e reuso das capacidades de memória, qualificação e oportunidade.
- Rejeição de campos desconhecidos, dependências inventadas, remoção dos critérios mínimos e conteúdo fora do esquema JSON.
- Compilador de template: gera um artefato Go e testes a partir da especificação validada. Valores da IA são codificados como dados, nunca comandos, caminhos ou código livre.
- Execução de `go test` em diretório temporário, com timeout, sem dependências externas, sem herdar chaves de provedores e com acesso a dependências de rede desabilitado. Isso não é um sandbox para código arbitrário; apenas o template fixo é executado.
- Digest do artefato e evidência de compilação usados como requisitos da publicação.

O runtime genérico do deepH continua disponível. A ponte Genesis usa obrigatoriamente essa camada Arkom. Os quatro agentes ainda seguem `contexto > sdr + crm > revisor`; o revisor agora entrega JSON estrito. Pedidos fora do recorte resultam em explicação sem proposta aplicável, ou são rejeitados na validação.

## Como a mudança entra no backend

Nesta etapa o artefato Go gerado é compilado e testado como evidência da regra. **Não é carregado como plugin nem implantado como um serviço novo.** A aprovação publica a especificação tipada no motor Go existente do SDR, que usa o avaliador de `pkg/arkom`. Essa é a primeira forma de construir por reuso: ampliar a regra de uma capacidade existente sem gerar outro servidor ou banco.

A construção de módulos de backend Go inteiramente novos, migrations, deploy isolado e edição livre de código continuam futuras. Finance e as demais soluções ainda precisam ter seus contratos cadastrados; não foram anunciadas como capacidades conectadas.

## Persistência, permissões e concorrência

Propostas, versão atual, histórico e auditoria ficam no snapshot transacional SQLite já existente. São filtrados por organização. A proposta mantém a versão de origem e o artefato validado. O cliente não envia uma especificação na aprovação: aprova somente o ID existente no servidor.

Operador prepara e testa; administrador publica e restaura; perfil de consulta não altera. A publicação exige uma prévia anterior e a mesma versão ativa da preparação. Uma proposta antiga não sobrescreve uma regra mais nova. Repetir publicação ou restauração não cria outra versão. Uma falha de persistência reverte a mutação. Restaurar critérios não desfaz efeitos externos.

O índice de execuções dos agentes ainda é em memória. As propostas e versões publicadas sobrevivem ao reinício. A demo mantém o limite de uma execução de agentes por vez, cem propostas por empresa e cem versões publicadas por empresa.

## API da demo

Todas as rotas exigem sessão e flags do ambiente local:

| Método e rota | Efeito |
| --- | --- |
| `GET /v1/sdr/genesis-demo/capabilities` | Catálogo do recorte |
| `POST /v1/sdr/genesis-demo` | Inicia o time com `{ "input": "pedido" }` |
| `GET /v1/sdr/genesis-demo` | Estado dos agentes e ID da alteração produzida |
| `GET /v1/sdr/genesis-demo/changes` | Propostas e regra atual da empresa |
| `POST /v1/sdr/genesis-demo/changes/{id}/preview` | Simula `{ "facts": { "company": "Oficina", "goal": "Organizar vendas" } }`, sem efeitos |
| `POST /v1/sdr/genesis-demo/changes/{id}/publish` | Aprovação com `expected_version` e `reason` |
| `POST /v1/sdr/genesis-demo/changes/{id}/restore` | Restauração da proposta ativa com `expected_version` e `reason` |

Campos suportados: empresa, objetivo, nome, segmento, quantidade de vendedores, volume de contatos e ferramenta atual. Esta versão exige apenas presença, sem limiares como “mais de cinco vendedores”. Empresa e objetivo são sempre obrigatórios. O título da oportunidade também pode ser personalizado.

## Verificar

```sh
(cd packages/deeph && go test ./pkg/arkom)
(cd services/sdr && go test ./...)
(cd apps/portal && npx tsc --noEmit)
```

Os testes cobrem compilação real do artefato, escape de conteúdo, rejeição de backend externo, contrato desconhecido, prévia sem efeitos, aprovação, isolamento por empresa, persistência, rollback, repetição, conflitos de versão e o enfileiramento efetivo da oportunidade somente após preencher todos os fatos válidos. Go deve estar no PATH da API Genesis para compilar a proposta.

O módulo SDR referencia o pacote deepH por `replace deeph => ../../packages/deeph`. Compile a partir deste monorepo, preservando sua estrutura. O launcher copia os YAMLs atualizados ao iniciar. Mudanças no código exigem reconstruir os binários antes de reiniciar.
