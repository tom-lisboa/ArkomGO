# Runbook — mensagens de bloqueio (crédito de mentoria e prazo de acesso)

> Para o suporte (Paulo Lucas) e para a Carol. O aluno manda print da mensagem;
> a mensagem diz exatamente qual regra bateu e o que conferir.
> Fonte da verdade das frases: `src/lib/credit-policy.ts` (constantes
> `MENSAGEM_*`) e `src/lib/access-expiration.ts` (`MENSAGEM_RENOVACAO_AULA`).
> Mudou a frase lá? Atualize este arquivo no mesmo commit.

## Antes de tudo: os créditos estão valendo?

`/admin/settings` → seção de flags.

| Flag | Desligada | Ligada |
|---|---|---|
| `credit_shadow_mode` | nada é registrado | confirma normal e **anota** o veredito em `credit_shadow_log` |
| `credit_blocking_enabled` | **ninguém é barrado, nada é debitado** | mentoria do Arkom debita e saldo insuficiente barra |
| `entitlements_enabled` | plano não vale (todo mundo é legado) | plano/prazo/catálogo valem |
| `expiration_enforcement` | vencido ainda confirma (se tiver saldo) e conclui aula | vencido não confirma mentoria nem conclui aula nova (exige `entitlements_enabled`; NÃO exige `credit_blocking_enabled`) |
| `debit_policy` (escopo) | `{"policy":"on_confirmation"}` = cobra ao confirmar | `{"policy":"on_participation"}` = cobra quando o mentor marca presença (Tarefa 2) |

**Se o aluno diz que foi barrado e `credit_blocking_enabled` está desligada, o
problema NÃO é crédito** — é status da conta (`blocked`), evento em rascunho ou
erro de rede. `credit_blocking_enabled` ligada com `entitlements_enabled`
desligada não bloqueia ninguém: o sistema cai sozinho para o modo sombra.

---

## As mensagens de bloqueio

### 1a. "Suas horas de mentoria acabaram…" (saldo ZERADO)

> Suas horas de mentoria acabaram. Você já usou todas as horas do seu plano —
> fale com o suporte do Arkom para liberar mais horas ou aguardar a renovação.

**Significa:** o aluno TEM direito a mentorias e o saldo (soma do extrato)
está em **zero ou negativo**.

### 1b. "Esta mentoria usa Xh e você tem Yh de saldo…" (saldo INSUFICIENTE)

> Esta mentoria usa 2h e você tem 1h de saldo. Escolha um encontro mais curto
> ou fale com o suporte do Arkom para liberar mais horas.

**Significa:** ainda há saldo, mas ele **não cobre o custo DESTE evento**
(achado do dono no QA manual, 2026-07-28: dizer "acabaram" pra quem vê 1h no
contador era contradição). Os números da frase vêm do caso real do aluno.
Mesma checagem e mesma resolução da 1a.

**O que o suporte confere** — `/admin/students/<id>` → painel "Plano e créditos":
1. **Saldo** no topo do painel. Bate com o que o aluno diz?
2. **Extrato**: cada linha "Débito por mentoria" mostra a mentoria e a data.
   Débito repetido no mesmo evento não existe — se parecer que existe, é
   confirmar → cancelar → confirmar de novo (aparece o estorno no meio).
3. **Cota do plano** ("Mentorias: 4 no total"). Se o aluno comprou mais créditos
   e eles não entraram, use **Ajustar créditos → Adicionar**, sempre com motivo
   (fica no extrato, com o seu nome).

**Resolução:** conceder crédito manual (com motivo) ou trocar/renovar o plano.

---

### 2. "Seu acesso está vencido…"

> Seu acesso está vencido. Você continua com o catálogo e o seu progresso, mas
> confirmar presença em mentoria exige um plano dentro da validade — fale com o
> suporte do Arkom para renovar.

**Significa:** o entitlement temporal do aluno passou da validade. Ele continua
entrando, vendo curso e progresso (regra X1/X3); só não consome mentoria.

**O que o suporte confere** — mesmo painel, bloco **"Prazo de acesso"**:
1. **Validade** ("Vence em dd/mm/aaaa" + selo Dentro do prazo / Expirando /
   Expirado) e a **origem** do prazo (do plano ou definido à mão).
2. **Histórico** (botão ao lado): cada mudança de prazo com motivo, autor e
   horário. É a auditoria — nada é sobrescrito, cada versão vira uma linha.
3. Para corrigir: **Trocar plano** (materializa validade nova a partir de hoje)
   ou **Definir/Ajustar prazo** (data à mão, com motivo obrigatório). Remover o
   prazo devolve o acesso na hora — vencido é estado derivado da data, não há
   nada a "desexpirar".
4. Esta mensagem só aparece com a flag `expiration_enforcement` ligada (junto
   com `entitlements_enabled`). Com ela desligada, um aluno vencido ainda
   confirma — e o modo sombra registra `would_block_expirado`, que é como se
   mede o impacto antes de ligar. Ligada, ela barra **mesmo com os créditos
   desligados**: o prazo tem flag própria.
5. Vale só para **mentoria do Arkom**. Live da comunidade continua aberta para
   quem está vencido.

**Resolução:** renovar/atribuir plano, ou ajustar a data no bloco "Prazo de
acesso" com o motivo.

---

### 3. "Seu plano não inclui mentorias ao vivo…"

> Seu plano não inclui mentorias ao vivo. As lives da comunidade continuam
> liberadas para você — fale com o suporte do Arkom para incluir mentorias no
> seu plano.

**Significa:** o plano do aluno tem cota **0** de mentorias (ou o direito
quantitativo não existe). Não é "acabou": nunca teve.

**O que o suporte confere:**
1. **Plano** no painel do aluno e a linha "Mentorias" (cota).
2. `/admin/plans` → o plano em questão. Cota 0 é intencional? Se o produto
   mudou, ajuste o plano E **reatribua** ao aluno (editar plano não mexe em
   quem já está nele).
3. O evento é mesmo uma mentoria? `/admin/mentorships`, coluna **Tipo / custo**:
   `Live` nunca cobra e nunca barra. Se um evento aberto está marcado como
   `Mentoria` por engano, corrija ali — vale na hora.

**Resolução:** mudar de plano, ou conceder créditos avulsos com motivo.

---

### 4. "Seu acesso está vencido. O catálogo e as aulas que você já concluiu…"

> Seu acesso está vencido. O catálogo e as aulas que você já concluiu continuam
> aí, mas registrar o progresso de uma aula nova exige um plano dentro da
> validade — fale com o suporte do Arkom para renovar.

**Significa:** mesma causa da mensagem 2 (prazo vencido), mas o aluno bateu no
ponto de consumo de **aula**, não de mentoria. Aparece ao tentar marcar uma
aula NOVA como concluída.

**O que continua liberado para o aluno vencido** (X1/X3, de propósito):
entrar na plataforma, ver o catálogo inteiro, abrir aula, ver e **desmarcar** o
próprio progresso, curtir e avaliar. Nada do que já estava concluído é apagado.

**O que o suporte confere:** o bloco "Prazo de acesso" na ficha do aluno (igual
à mensagem 2). **Resolução:** renovar o plano ou ajustar a data com motivo.

---

### 5. "Esta mentoria já foi encerrada…"

> Esta mentoria já foi encerrada. A confirmação de presença vale só até o fim
> do horário do evento.

**Significa:** o aluno tentou mexer na presença de um evento que **já
terminou** (regra do dono, 2026-07-27). O corte é o FIM do horário, em GMT-3;
sem hora de término cadastrada vale início + 60 min. Vale para confirmar E
desconfirmar — depois do fim, a presença congela como registro histórico.
Não é questão de saldo nem de plano: é calendário. Na capa o aluno nem vê o
botão; esta mensagem só aparece se ele estava com a página aberta de antes.

---

## Vencimentos: a lista de renovação

`/admin/plans` → botão **Vencimentos** (ou o card "Vencimentos" na Visão geral).

- Janelas de **30/60/90 dias**, contagem de vencidos e de "expirando", busca por
  nome/e-mail/plano e exportação em CSV (`/admin/exports` → Vencimentos).
- **"Expirando"** = vence em até N dias. O N (e as janelas) são configuráveis
  **sem deploy**: `/admin/settings` → "Prazo de acesso valendo" → Editar escopo
  → `{"alerta_dias": 30, "janelas": [30, 60, 90]}`.
- **"Processar expirações"** recalcula tudo e registra o resumo do dia. Não
  altera nada dos alunos — só relê e anota. Rodar duas vezes no mesmo dia, com
  o mesmo estado, não registra nada de novo.
- **Não há e-mail automático de aviso** (não existe infra de e-mail
  transacional para isso hoje): o alerta é o destaque no relatório e a contagem
  na Visão geral.
- Relatório vazio é resultado legítimo: hoje **ninguém tem prazo**, porque
  todos os perfis estão no plano "Legado" (permissivo, sem expiração).

---

## Cancelamento e estorno (regra E1)

- O aluno pode desfazer a presença **até o INÍCIO da mentoria** ("em cima da
  hora" inclusive — decisão do dono, 2026-07-25) e o crédito volta — como
  **lançamento novo** de estorno (o débito original nunca some do extrato).
- Depois que o evento **começou**, cancelar libera a vaga mas **não devolve o
  crédito** (senão confirmar → assistir → desconfirmar viraria crédito grátis).
  O aluno vê: *"Presença cancelada, mas o crédito não volta: o estorno só vale
  para cancelamentos feitos antes de a mentoria começar."*
- Horário de referência: **America/Sao_Paulo** (o mesmo do calendário do aluno).
- Exceção legítima (aluno cancelou tarde por um motivo aceito): **Ajustar
  créditos → Adicionar 1**, motivo "estorno manual — cancelamento fora da
  janela, evento X". Fica auditado.

## Cancelamento pelo Arkom (regra E3)

`/admin/mentorships` → ícone de calendário cortado → **Cancelar pelo Arkom**:
- despublica a mentoria (some do calendário do aluno) e carimba o cancelamento;
- **estorna automaticamente todos os débitos** daquele evento, aluno por aluno;
- é idempotente: clicar duas vezes não estorna duas vezes ("0 estorno(s)").
- nada é apagado: confirmações e histórico continuam lá.

## Mentoria com extrato NÃO se exclui (report do dono, 2026-07-28)

No `/admin/mentorships` o botão **Excluir** aparece travado (cinza) quando a
mentoria já gerou lançamento de crédito. Clicando nele, a tela diz o motivo:

> **Esta mentoria não pode ser excluída**
> Ela tem 2 lançamentos de crédito (débitos/estornos) no extrato de 1 aluno, e
> extrato é histórico: não se apaga. Ela permanece cancelada e fora do
> calendário do aluno.

**Significa:** o extrato (`credit_ledger`) e o diário de créditos
(`credit_shadow_log`) são **append-only** — apagar o evento exigiria mexer
nessas linhas, e o banco recusa. Não é erro de rede: **retentar não resolve**.
Até 2026-07-28 a tela devolvia "Não foi possível excluir a mentoria. Tente
novamente.", o que fazia o admin tentar de novo para sempre.

**O que fazer no lugar:** se o encontro não vai acontecer, use **Cancelar pelo
Arkom** (seção acima) — sai do calendário do aluno e estorna os créditos. A
mentoria fica na lista carimbada como "Cancelada pelo Arkom": é o registro de
que ela existiu e movimentou horas.

**Excluir continua normal** para mentoria que nunca gerou lançamento (live da
comunidade, evento criado por engano, encontro sem confirmação nenhuma).

> O corte é do **servidor**: mesmo que a lista esteja desatualizada (o extrato
> nasceu com a tela aberta), a exclusão é recusada com o mesmo motivo.

## Republicação recontabiliza (achado do dono, 2026-07-28)

Como o cancelamento estorna mas MANTÉM as confirmações, **republicar** um
evento (botão Publicar ou edição com status Publicado) revalida cada
confirmação sem débito em aberto contra o saldo ATUAL do aluno:
- saldo cobre o custo ⇒ **recobrança automática** (lançamento novo no extrato,
  com o admin como autor — o aluno volta ao estado de antes do cancelamento);
- saldo não cobre ⇒ a **confirmação é removida** (o aluno reconfirma quando
  tiver horas; assento nunca fica sem lastro).

O toast do admin resume: *"Recontabilização da republicação: X recobrança(s)
lançada(s) no extrato e Y confirmação(ões) removida(s) por falta de saldo."*
Sem esse aviso = ninguém precisou de ajuste. Idempotente (despublicar e
republicar de novo não cobra duas vezes — mesma chave por ciclo de estornos do
fluxo do aluno). Só age em modo enforce, em mentoria do Arkom com custo > 0, e
nunca em evento que já terminou. Antes disso (até 2026-07-28), cancelar →
aluno gastar o estorno → republicar deixava o aluno com mais horas confirmadas
do que o plano cobre.

---

## Onde olhar no banco

Sempre no schema `educacional`.

```sql
-- 1) O que a SOMBRA viu (antes de ligar o bloqueio)
select verdict, count(*) as vezes
  from educacional.credit_shadow_log
 where action = 'confirm'
 group by 1 order by 2 desc;

-- 2) Quem teria sido barrado, com nome, evento e saldo
select l.created_at, p.full_name, p.email, l.event_title, l.verdict,
       l.credit_cost, l.balance_before, l.plan_slug, l.mode, l.enforced, l.detail
  from educacional.credit_shadow_log l
  join educacional.profiles p on p.id = l.profile_id
 where l.verdict like 'would_block%'
 order by l.created_at desc
 limit 50;

-- 3) O extrato de um aluno (o saldo é a soma disto; não existe coluna de saldo)
select created_at, delta, reason, note, ref, event_id, actor_label
  from educacional.credit_ledger
 where profile_id = <id>
 order by created_at desc;

select coalesce(sum(delta), 0) as saldo
  from educacional.credit_ledger where profile_id = <id>;

-- 4) Débito × estorno de um evento (conferir E1/E3)
select profile_id,
       -sum(delta) filter (where reason = 'event_debit')  as debitado,
        sum(delta) filter (where reason = 'event_refund') as estornado
  from educacional.credit_ledger
 where event_id = <id_do_evento>
 group by profile_id order by profile_id;

-- 5) Classificação dos eventos (mentoria cobra, live não)
select id, event_kind, credit_cost, title, event_date, starts_at
  from educacional.mentorship_events
 order by event_date desc, id desc;

-- 6) Vencimentos: quem tem prazo, em que estado (o mesmo recorte da tela)
select p.full_name, p.email, pl.name as plano, e.source,
       to_char(e.expires_at at time zone 'America/Sao_Paulo','DD/MM/YYYY') as expira_em,
       (e.expires_at at time zone 'America/Sao_Paulo')::date
         - (now() at time zone 'America/Sao_Paulo')::date as dias,
       (e.expires_at <= now()) as expirado, e.reason, e.granted_by_label
  from educacional.profile_entitlements e
  join educacional.profiles p on p.id = e.profile_id
  left join educacional.plans pl on pl.id = e.plan_id
 where e.kind = 'temporal' and e.status = 'active'
   and e.expires_at is not null and p.status <> 'deleted'
   and (e.source = 'manual' or coalesce(pl.permissive, false) = false)
 order by e.expires_at;

-- 7) Histórico de prazo de UM aluno (auditoria: motivo, autor, horário)
select e.status, e.source, e.expires_at, e.reason, e.granted_by_label, e.granted_at
  from educacional.profile_entitlements e
 where e.profile_id = <id> and e.kind = 'temporal'
 order by e.created_at desc;

-- 8) Execuções do job de expiração (uma linha por dia e origem)
select run_key, source, lead_days, total_com_prazo, total_ativos,
       total_expirando, total_expirados, detail, ran_by, ran_at, updated_at
  from educacional.expiration_runs
 order by ran_at desc;
```

**Três regras que valem sempre:**
1. `credit_ledger` e `credit_shadow_log` são **append-only** — o banco recusa
   UPDATE/DELETE. Corrigir crédito é lançar movimento novo (o painel do aluno
   faz isso com motivo e autor).
2. **Saldo é sempre `SUM(delta)`.** Se algum lugar mostrar um número diferente
   da soma do extrato, é bug — abra chamado, não "conserte" o banco.
3. **"Expirado" não existe como coluna.** É `expires_at <= now()`, calculado na
   hora. Não existe (e não deve existir) um script que "marque os vencidos":
   virar a linha temporal para `status='expired'` faria o aluno voltar a
   parecer SEM prazo, porque o app só lê entitlements ativos.
