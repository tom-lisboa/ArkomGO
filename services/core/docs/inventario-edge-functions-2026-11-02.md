# Inventário de Edge Functions

Data: 02/11/2026. Status: parcial, coleta bloqueada por acesso.

## Evidência confirmada

Organização: bilhon-core (`ijdgkwstlemevcomnfqw`). Projeto central: solutions (`auytmefqnuzbktyzcled`). Branch: main / production.

O painel autenticado exibe **710 funções no projeto solutions**. Isso não é o total de toda a organização, nem comprova atividade das funções.

Fonte: https://supabase.com/dashboard/project/auytmefqnuzbktyzcled/functions

## Nomes efetivamente observados

| Função | Comportamento, chamadores, dependências e volume |
|---|---|
| `adm_automation-execute` | Ainda não inspecionados |
| `adm_automation-run` | Ainda não inspecionados |
| `adm_benchmark-sync` | Ainda não inspecionados |
| `adm_check-user-active` | Ainda não inspecionados |
| `adm_evaluate-rules` | Ainda não inspecionados |
| `adm_notify-dispatch` | Ainda não inspecionados |
| `adm_revenue-reconcile` | Ainda não inspecionados |
| `adm_shopify-proxy` | Ainda não inspecionados |
| `adm_snapshot-insights` | Ainda não inspecionados |
| `adm_validate-signup` | Ainda não inspecionados |
| `adm_whatsapp-connect` | Ainda não inspecionados |

## Limitação de acesso

A sessão CLI disponível lista outra organização. A tentativa de listar funções do projeto central recebeu HTTP 403: conta sem privilégios para esse endpoint. O navegador permite leitura do painel, mas a ferramenta de interação falhou repetidamente com `noWindowsAvailable` ao percorrer a tabela. Nenhuma função foi alterada ou executada.

## Dados necessários para concluir

Exportar lista completa publicada e código de cada função; confrontar com repositórios, agendamentos e webhooks; levantar invocações por função em janela definida; registrar autenticação, tabelas/RPCs, APIs externas, efeitos colaterais, tentativas e requisitos de duração/concorrência. Classificar destino como serviço HTTP, worker, agendamento, consolidação ou candidata a desativação, sempre com evidência.

Não classificar função como inativa apenas por nome ou data de atualização.

## Atualização 03/11/2026

Acesso CLI confirmado. Lista completa de metadados exportada: **721 funções** no projeto solutions. Arquivos: `edge-functions/solutions-inventory.json` e `edge-functions/solutions-inventory.csv`. Código, chamadores e volume por função continuam pendentes.
