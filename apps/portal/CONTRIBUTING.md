# Contribuindo com o arkom-dash

Governança de colaboração da org bilhon-business (Kit Bilhon). O objetivo é simples:
**ninguém dá push sem antes absorver o que está adiante na `main`; toda mudança entra
por PR clara, com CI verde e branch atualizada.**

## Fluxo de trabalho

1. Crie sua branch a partir da `main` atualizada:
   `git fetch origin && git checkout -b feat/minha-mudanca origin/main`
2. Faça os commits (Conventional Commits — ver abaixo).
3. Antes do push, garanta que a branch está atualizada com a `main`:
   `git fetch origin && git merge origin/main` (o hook `pre-push` bloqueia se estiver atrás).
4. `git push -u origin feat/minha-mudanca`
5. Abra o PR: `gh pr create --base main`
6. Espere o **CI Gate** verde → 1 aprovação (code owner) → merge.

Push direto na `main` é bloqueado: o hook `pre-commit`/`pre-push` local avisa, e o
workflow `guard-main.yml` reverte automaticamente qualquer push direto sem PR (conta
pessoal Free, sem ruleset server-side).

## Hooks (ativam sozinhos)

Os hooks vivem em `.githooks/` e são ativados pelo `postinstall` no `npm install`
(`git config core.hooksPath .githooks`). Nada a fazer manualmente após um `npm install`.

- `pre-commit` — bloqueia commit feito direto numa branch protegida (`main`).
- `pre-push` — bloqueia push direto na `main` e push de branch atrás de `origin/main`.

Escapes (uso excepcional):
- `BILHON_SKIP_UPTODATE=1 git push ...` — pula só o check de branch atualizada.
- `git push --no-verify` — pula todos os hooks.

## CI Gate

O check obrigatório do PR é o **CI Gate** (workflow `.github/workflows/ci.yml`),
um agregador que só fica verde quando todos os jobs internos passam:

- **Branch atualizada com a base** — a branch não pode estar atrás da `main`.
- **Type check** — `npm run typecheck`.
- **Build** — `npm run build`.

### O que ficou FORA do gate (e por quê)

- **Lint (`npm run lint`)** — atualmente falha na `main` (9 erros de
  `react-hooks/set-state-in-effect` em arquivos pré-existentes). Um gate que nasce
  vermelho é um gate que o time aprende a ignorar. Corrija os erros e então promova
  o `lint` a job do gate (adicione um job `lint` e inclua-o no `needs` do `ci-gate`).
- **E2E (Playwright, `e2e/`)** — os 18 specs exigem credenciais de login
  (`E2E_EMAIL`/`E2E_PASSWORD`), Supabase e provider de IA (Gênesis), com timeout de
  até 10 min por teste. Depende de secrets/serviços externos e é lento — fora do gate
  de PR. Rode manualmente/localmente ou num workflow agendado com secrets.

## Convenção de commits

Conventional Commits — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`...
Ex.: `feat: adiciona filtro de skills no mapa radial`.
