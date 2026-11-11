# Dados por cliente, GraphQL e portabilidade · etapa 0.12

Esta etapa está implementada na cópia independente do piloto. A entrega é local e fica desativada por padrão. Não houve implantação no servidor, alteração do SDR Go oficial, do motor WhatsApp original ou acesso ao Supabase. O pacote 0.11.1 já distribuído continua como estava.

## Separação e autorização

O cliente aqui é a empresa contratante (`organization_id`); contatos e leads pertencem a essa empresa. O isolamento atual é lógico, dentro dos bancos exclusivos da nova plataforma. Não existe um banco físico por comprador e ainda não existe provisionamento automático de uma empresa por Remix.

A sessão do backend determina a empresa. O cliente não escolhe `organization_id` no GraphQL. IDs e cursores de outra empresa não concedem acesso. A exportação em lote e o novo GraphQL exigem administrador; operador e consulta conservam seus acessos anteriores às rotas existentes. O monitor global continua exigindo autoridade interna separada.

O núcleo de métricas mantém apenas metadados de acionamentos, resultados e sequências, não uma cópia das conversas. A nova projeção `/customer-report`, acessível somente na rede privada com credencial de worker, exige uma empresa e omite catálogo de clientes, cursor global e contadores internos. A API fixa essa empresa a partir da sessão antes de consultar o worker. Não há acesso direto do Lovable ao banco ou à rede privada.

## GraphQL de dados

Endpoint autenticado: `POST /v1/customer/graphql`, sob o prefixo público `/sdr-next`.

O schema está em `customer-schema.graphql`. Esta primeira versão é de **consulta**: operações de atendimento, publicação, aprovação e execução continuam nos contratos existentes. Não há execução de SQL ou código arbitrário pelo GraphQL.

Exemplo de consulta para uma integração feita no Lovable:

```graphql
query MeusDados($after: String, $conversation: ID, $from: Time, $to: Time) {
  customer {
    organizationId
    records(collection: "messages", first: 50, after: $after,
            conversationId: $conversation, from: $from, to: $to) {
      items { id conversationId recordedAt data }
      nextCursor
      hasMore
    }
    workerUsage(days: 30) { available report retentionDays }
    exports { id status capturedAt expiresAt downloadPath errorCode }
  }
}
```

Use `Authorization: Bearer <sessão do usuário>`. Não inclua a sessão no código nem a envie no chat do Lovable. O cliente pode criar suas telas usando `frontend/src/customer-api.ts`; a tela `CustomerData.tsx` é uma implementação de referência.

Coleções: conversas, mensagens, contatos por conversa, memória, negócio (rascunho e versões), configuração de fluxos (rascunho e versões), execuções, processamentos de contexto/IA, recibos de contexto, metadados de mídia e seu processamento, notas, entregas, auditoria, eventos retidos dos workers e configuração pública do WhatsApp. `collections` retorna os nomes exatos disponíveis. `data` é um objeto JSON de projeção pública, nunca o estado bruto do servidor. A etapa candidata 0.13 também acrescenta `calendars`, `calendar_connections`, `calendar_requests` e `calendar_bookings`, sem tokens ou fluxo OAuth.

Paginação de 1 a 100 registros; cursor vinculado à empresa, coleção e filtros. Datas são RFC3339 e aplicam-se ao horário documentado em `recordedAt`, não a todos os horários internos do objeto. Registros sem horário conhecido têm `recordedAt: null` e são excluídos quando se aplica filtro de data. As páginas são consultas atuais, não um snapshot histórico imutável. Para uma captura consistente dos registros, use a exportação.

Proteções desta etapa: corpo HTTP até 16 KB, consulta até 8 KB, profundidade 8, até 256 seleções, até quatro resoluções paralelas, orçamento de 500 linhas e 2 MB de dados por consulta, resposta até 3 MB, prazo de oito segundos, 30 requisições por minuto por administrador/empresa. O custo é rejeitado com erro; não há truncamento silencioso. Introspecção descreve somente o schema público e também exige sessão de administrador.

## Um botão para baixar

Na interface, **Meus dados → Baixar meus dados** solicita a preparação, acompanha o estado e baixa o ZIP autenticado quando estiver pronto. Se a tela for fechada, o pedido permanece no backend. O administrador pode voltar e continuar o download. A chave de repetição é preservada se a confirmação da criação ficar incerta.

Rotas:

- `POST /v1/customer/exports`, corpo `{}` e `Idempotency-Key`: solicita o arquivo.
- `GET /v1/customer/exports/{id}`: consulta a preparação da própria empresa.
- `GET /v1/customer/exports/{id}/content`: baixa o ZIP com a sessão atual.

O worker de dados é um módulo Go (`internal/dataworker`) executado em segundo plano **dentro do processo da API nesta etapa**. Não é um novo processo/container independente. Não chama OpenAI ou WhatsApp e não altera conversa, conhecimento ou regras. A API faz uma projeção explícita dos registros da empresa, fora de qualquer snapshot bruto global; o worker monta o ZIP fora da trava do atendimento e lê um anexo de cada vez. Os pedidos persistem no banco exclusivo do piloto e retomam após reinício. Um processamento que não conseguiu confirmar a conclusão pode ser repetido com segurança.

O ZIP contém JSON por coleção, arquivos disponíveis e `manifest.json` com cobertura, horário da captura, integridade e anexos indisponíveis. Os nomes originais fornecidos pelos usuários nunca viram caminhos de arquivo. O arquivo temporário é privado, com permissões restritas, e só é publicado para download após concluir a gravação. Solicitação, preparação e download geram auditoria da empresa; o worker `data` também gera eventos de início e resultado para o monitor existente.

As credenciais de provedores, códigos do piloto, tokens de sessão/worker, posses de tarefas, códigos de pareamento, QR, chaves criptográficas do WhatsApp, código do backend e dados de outras empresas ficam fora da exportação.

## Cobertura real e limites

- Inclui os registros que **esta plataforma recebeu e ainda conserva**. Não importa o histórico anterior do celular, grupos ou tipos de mensagens que o piloto ainda não recebe. Exportar não solicita novas mensagens ao WhatsApp.
- Anexos mantêm a retenção atual de sete dias. O manifesto lista arquivos expirados ou indisponíveis; não promete recuperar bytes já eliminados. Conteúdo recebido mas ainda em download pode constar como indisponível.
- A fonte de eventos dos workers retém até sete dias; o monitor conserva agregados por até 90 dias, a partir do começo da coleta. Não é histórico de uso anterior à instalação. As métricas têm horário próprio e coleta assíncrona. Ausência do monitor fica explícita no manifesto, sem impedir a recuperação dos demais dados.
- O arquivo expira 24 horas depois do pedido. São permitidos dois pedidos não expirados e um em preparação por empresa. O worker processa um arquivo de cada vez.
- O piloto limita uma coleção a 20 mil registros, metadados do pacote a 16 MB e o ZIP a 384 MB; excesso gera falha explícita, não um arquivo incompleto apresentado como completo. Arquivos expirados são removidos nas próximas passagens do worker.
- O download transporta dados privados do próprio cliente. Nenhum arquivo fica público por conhecer sua URL: a autorização é conferida a cada acesso, inclusive para download parcial.

Esses controles não substituem uma avaliação de produção. Identidade individual, recuperação/revogação de acessos, cadastro de novas empresas, políticas contratuais de retenção/exclusão, cópias de segurança e a capacidade de exportar volumes maiores continuam etapas próprias. Criptografia do disco e um banco físico por cliente não foram acrescentados nesta mudança.

## Ativação isolada e validação

Somente na instalação nova, `SDR_CUSTOMER_DATA_ENABLED=true` habilita as rotas e o worker interno de exportação; requer o banco persistente do piloto. Os arquivos ficam na subpasta privada `customer-exports` do diretório de dados do piloto. Quando a opção não está ativa, a função informa indisponibilidade e os atendimentos existentes continuam usando as rotas anteriores.

Antes de ativar para testadores: atualizar o backend e o worker de métricas independentes, validar isolamento e download com fixtures, compilar a interface e gerar novo pacote Lovable. Não usar os bancos ou credenciais operacionais originais como massa de teste. Esta implementação não foi implantada automaticamente.

Referências técnicas: [limites de demanda do GraphQL](https://graphql.org/learn/security/), [paginação](https://graphql.org/learn/pagination/) e [biblioteca Go utilizada](https://github.com/graph-gophers/graphql-go).
