# Migrations do backend Arkom

Estas migrations criam o schema transacional `app_arkom`, a role-grupo global
`arkom_runtime` e o bucket privado `arkom-media` no projeto Supabase central.
Elas não criam nem alteram objetos em `core` ou `educacional`.

Não existe runner automático neste repositório. A aplicação é manual e deve ser
feita por uma pessoa com acesso autorizado ao banco central.

## Pré-requisitos

1. Confirme que a conexão aponta para o projeto central esperado
   (`auytmefqnuzbktyzcled`) e não para outro Supabase.
2. Configure `ARKOM_MIGRATION_DATABASE_URL` somente na estação do operador, com
   uma role autorizada a criar schemas/roles, objetos em `app_arkom` e policies
   em `storage`.
   Nunca salve a URL completa em commits, tickets, logs ou no ambiente do app.
3. Pare se `app_arkom` já existir com objetos que não vieram destas migrations.
   Faça inventário e revisão antes de reaplicar.
4. Gere `ARKOM_SESSION_SECRET` fora do repositório (por exemplo, 48 bytes
   aleatórios) e guarde-o apenas no gerenciador de secrets do ambiente.

`ARKOM_DATABASE_URL` é uma credencial distinta, usada somente pelo runtime e
limitada ao schema `app_arkom`. Ela não deve poder administrar `auth`, `storage`,
`core`, `educacional` ou criar/alterar schemas. Use uma role dedicada, conceda
somente o DML necessário nas tabelas/sequences de `app_arkom` e mantenha
`search_path=app_arkom`. Nunca execute migrations com a credencial de runtime.

## Snapshot obrigatório antes da aplicação

Guarde a saída abaixo em local privado. Ela é a prova de que as contagens do
`educacional` permaneceram inalteradas. No `psql`, `\gexec` executa uma consulta
`count(*)` exata por tabela sem criar objetos:

```sql
select format(
  'select %L as table_name, count(*)::bigint as row_count from educacional.%I;',
  tablename,
  tablename
)
from pg_tables
where schemaname = 'educacional'
order by tablename
\gexec
```

Registre também o inventário de objetos compartilhados:

```sql
select n.nspname as schema_name,
       count(distinct c.oid) filter (where c.relkind in ('r','p','v','m','S')) as relations,
       count(distinct p.oid) as functions
from pg_namespace n
left join pg_class c on c.relnamespace = n.oid
left join pg_proc p on p.pronamespace = n.oid
where n.nspname in ('core', 'educacional')
group by n.nspname
order by n.nspname;
```

## Ordem de aplicação

Execute a partir da raiz do repositório, sempre com `ON_ERROR_STOP` e uma única
transação atômica para o lote completo:

```bash
psql "$ARKOM_MIGRATION_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f db/migrations/0001-app-arkom-schema.sql \
  -f db/migrations/0002-auth-central-link.sql \
  -f db/migrations/0003-authenticated-media-storage.sql \
  -f db/migrations/0005-user-theme-preference.sql \
  -f db/migrations/0006-session-version.sql \
  -f db/migrations/0007-auth-identity-integrity.sql
```

No PowerShell, use a variável de ambiente sem imprimir seu valor:

```powershell
psql $env:ARKOM_MIGRATION_DATABASE_URL -X -v ON_ERROR_STOP=1 --single-transaction `
  -f db/migrations/0001-app-arkom-schema.sql `
  -f db/migrations/0002-auth-central-link.sql `
  -f db/migrations/0003-authenticated-media-storage.sql `
  -f db/migrations/0005-user-theme-preference.sql `
  -f db/migrations/0006-session-version.sql `
  -f db/migrations/0007-auth-identity-integrity.sql
```

O salto de `0003` para `0005` é intencional; não há migration `0004` a aplicar.
No SQL Editor do Supabase, envolva o conteúdo integral de **cada** arquivo em
`begin;` / `commit;`, execute na mesma ordem e interrompa ao primeiro erro. Se
qualquer statement falhar, execute `rollback;` e investigue antes de continuar.

- `0001`: cria as 16 tabelas de `app_arkom`, habilita RLS e revoga schema,
  tabelas, sequences e functions de `public`/`anon`/`authenticated`; também cria
  a role-grupo sem login `arkom_runtime`, policies RLS server-only e grants DML
  mínimos para os membros dessa role.
- `0002`: liga `profiles` ao `auth.users` central por `auth_user_id` com FK
  `ON DELETE SET NULL`, adiciona o gate `must_change_password` e torna o
  `password_hash` legado nullable.
- `0003`: cria/atualiza o bucket privado `arkom-media` e policies que usam
  exclusivamente `app_metadata.arkom_role`.
- `0005`: garante a preferência de tema compatível com `light`/`dark`.
- `0006`: versiona sessões locais para revogá-las em troca de senha,
  bloqueio e exclusão lógica.
- `0007`: adiciona o UUID-tombstone imutável `auth_identity_id`, reconcilia
  identidades centrais de e-mail já existentes com assertion de cobertura e
  cria a função restrita que atualiza somente claims Arkom de forma atômica.
  Identidades futuras recebem o perfil local idempotentemente no primeiro login.

O acesso transacional da aplicação é feito por Postgres direto. Não conceda
`USAGE` ou privilégios de tabela do `app_arkom` a roles PostgREST.

## Provisionamento da credencial runtime

A migration cria apenas a role-grupo `arkom_runtime`, marcada como pertencente
ao Arkom e deliberadamente sem
`LOGIN`, senha, superuser, `CREATEROLE` ou `BYPASSRLS`. Depois de aplicar as
migrations, um operador autorizado deve criar uma role de login exclusiva e
conceder a ela somente essa associação. O bloco abaixo cria a role sem senha;
em seguida, no `psql`, `\password` solicita o segredo sem colocá-lo no histórico
SQL ou nos logs:

```sql
create role arkom_app_login
  login password null
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant arkom_runtime to arkom_app_login;

\password arkom_app_login
```

No SQL Editor, não use senha literal: crie a role sem `LOGIN` e coordene a
ativação/definição segura da senha com o administrador do banco.

Monte `ARKOM_DATABASE_URL` com `arkom_app_login`. Não use a role que executou as
migrations, o owner das tabelas, `postgres`, `service_role` ou uma role com
`BYPASSRLS`. Se o projeto não autorizar `CREATE ROLE`, pare e coordene a criação
com o administrador do Supabase; não relaxe RLS como fallback. Não configure
`ARKOM_DATABASE_SCHEMA`: o servidor fixa `search_path=app_arkom` no código.

## Verificações depois da aplicação

### Schema, tabelas, RLS e REVOKE

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'app_arkom'
order by tablename;

select has_schema_privilege('anon', 'app_arkom', 'USAGE') as anon_schema_usage,
       has_schema_privilege('authenticated', 'app_arkom', 'USAGE') as authenticated_schema_usage;

select table_name,
       has_table_privilege('anon', format('app_arkom.%I', table_name), 'select,insert,update,delete') as anon_dml,
       has_table_privilege('authenticated', format('app_arkom.%I', table_name), 'select,insert,update,delete') as authenticated_dml
from information_schema.tables
where table_schema = 'app_arkom'
order by table_name;

select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls
from pg_roles
where rolname in ('arkom_runtime', 'arkom_app_login')
order by rolname;

select pg_has_role('arkom_app_login', 'arkom_runtime', 'member') as runtime_member;

select count(*) as inherited_role_count
from pg_auth_members
where member = 'arkom_runtime'::regrole;

select count(*) as runtime_policy_count
from pg_policies
where schemaname = 'app_arkom'
  and policyname = 'arkom runtime full access'
  and 'arkom_runtime' = any(roles);

select distinct tableowner
from pg_tables
where schemaname = 'app_arkom';
```

Esperado: 16 tabelas, todas com `rowsecurity = true`, 16 policies runtime, e
todas as colunas de privilégio de `anon`/`authenticated` acima em `false`.
`arkom_runtime` deve ser `NOLOGIN`/`NOBYPASSRLS`; `arkom_app_login` deve ser
membro dela, também `NOBYPASSRLS`, e não pode aparecer como owner das tabelas.
`inherited_role_count` deve ser zero.

Confirme também que a credencial runtime não recebeu acesso lateral aos schemas
compartilhados:

```sql
select nspname as schema_name,
       has_schema_privilege('arkom_app_login', nspname, 'USAGE') as has_usage,
       has_schema_privilege('arkom_app_login', nspname, 'CREATE') as has_create
from pg_namespace
where nspname in ('core', 'educacional')
order by nspname;
```

Todas as colunas `has_usage`/`has_create` acima devem ser `false`.

Confirme o vínculo Auth e o legado de senha:

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'app_arkom'
  and table_name = 'profiles'
  and column_name in ('auth_user_id', 'auth_identity_id', 'must_change_password', 'password_hash', 'preferred_theme', 'session_version')
order by column_name;
```

`password_hash` deve aceitar `NULL`; senhas novas pertencem somente ao GoTrue.
`auth_identity_id` não possui FK e não é apagado quando `auth.users` é removido;
ele impede que um UUID novo recicle perfil/role/progresso pelo mesmo e-mail.

Confirme cobertura e integridade do vínculo:

```sql
select count(*) as central_email_users
from auth.users
where nullif(btrim(email), '') is not null;

select count(*) as linked_profiles
from app_arkom.profiles
where auth_user_id is not null
  and auth_identity_id = auth_user_id;

select count(*) as inconsistent_links
from app_arkom.profiles
where auth_user_id is not null
  and auth_identity_id is distinct from auth_user_id;
```

No rollout inicial, `central_email_users` e `linked_profiles` devem ser iguais;
`inconsistent_links` deve ser zero. Qualquer divergência exige revisão manual —
não remova o tombstone nem force vínculo por e-mail.

### Invisibilidade no PostgREST

Com uma anon key de teste, uma requisição com `Accept-Profile: app_arkom` não
pode retornar `2xx` nem linhas. O schema não deve estar na lista de schemas
expostos do PostgREST. Mesmo se alguém o expuser por engano, os REVOKEs acima
devem negar acesso. Não cole a chave no histórico do shell.

### Bucket e claim de role

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'arkom-media';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'arkom media%'
order by policyname;
```

Esperado: bucket privado, limite de 5 MiB e quatro policies. `SELECT` exige
`app_metadata.arkom_role` igual a `admin` ou `student`; `INSERT`, `UPDATE` e
`DELETE` exigem `admin`. Teste com JWTs reais e recém-emitidos: admin lê e grava
em `avatars`, `covers` e `resources`; student apenas lê; um usuário central sem
claim Arkom não lê nem grava. Alterações de role só chegam a um JWT já emitido
depois de renovar a sessão.

### Não regressão de `core` e `educacional`

1. Repita exatamente o snapshot de contagens de `educacional` e compare todas
   as linhas com o resultado anterior.
2. Repita o inventário de objetos `core`/`educacional`; ele deve ser idêntico.
3. Confirme por inspeção que nenhum arquivo deste diretório contém DDL para
   `core` ou `educacional`.
4. Se qualquer contagem ou inventário divergir, interrompa o rollout e investigue;
   não tente corrigir o schema compartilhado a partir deste repositório.

## Seed opcional de desenvolvimento

`ARKOM_AUTO_SEED=true` popula `app_arkom` somente quando `profiles` está vazio.
O processo aceita essa opção apenas com `NODE_ENV=development` ou `test` e lança
erro em qualquer outro ambiente. O seed não cria senha, usuário GoTrue ou convite
resgatável: o perfil administrativo de autoria fica bloqueado, sem vínculo Auth,
e o histórico de convites contém somente estados terminais (`used`, `revoked` ou
`expired`). Aponte-o exclusivamente para um banco descartável de desenvolvimento.

## Bootstrap manual do primeiro admin

Este procedimento é excepcional e deve ser executado uma única vez por operador
autorizado. Não crie um convite administrativo genérico e não habilite signup
público para contornar a ausência do primeiro admin.

1. No projeto central correto, procure primeiro o e-mail nominal aprovado. Se a
   identidade já existir, reutilize exatamente seu UUID após validar titularidade
   e autorização, sem ler, trocar ou confirmar novamente a senha compartilhada.
   Se não existir, crie-a pelo painel/API administrativa com e-mail confirmado e
   uma senha temporária aleatória não compartilhada. Nunca insira diretamente em
   `auth.users`.
2. Pela API administrativa, defina `app_metadata.arkom_role = "admin"` nesse
   UUID. Não use `user_metadata` para autorização.
3. Substitua os quatro placeholders abaixo e execute com a credencial de
   migration. Use `false` para identidade central preexistente e `true` somente
   para identidade recém-criada que deve trocar a senha. O bloco promove o perfil
   reconciliado pela `0002` ou o cria, e aborta em qualquer conflito de UUID/e-mail:

```sql
do $bootstrap$
declare
  bootstrap_auth_user_id uuid := '<AUTH_USER_UUID>';
  bootstrap_email text := lower('<ADMIN_EMAIL>');
  bootstrap_full_name text := '<ADMIN_NAME>';
  bootstrap_requires_password_change boolean := <TRUE_OR_FALSE>;
begin
  perform pg_advisory_xact_lock(hashtext('app_arkom:first-admin-bootstrap'));

  if exists (
    select 1
    from app_arkom.profiles
    where role = 'admin'
      and status = 'active'
      and not (
        auth_user_id = bootstrap_auth_user_id
        or lower(email) = bootstrap_email
      )
  ) then
    raise exception 'bootstrap recusado: já existe admin ativo';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = bootstrap_auth_user_id
      and lower(email) = bootstrap_email
      and email_confirmed_at is not null
      and raw_app_meta_data ->> 'arkom_role' = 'admin'
  ) then
    raise exception 'bootstrap recusado: identidade/claim central não confere';
  end if;

  if exists (
    select 1
    from app_arkom.profiles
    where (auth_user_id = bootstrap_auth_user_id or lower(email) = bootstrap_email)
      and (
        (auth_user_id is not null and auth_user_id != bootstrap_auth_user_id)
        or (
          auth_identity_id is not null
          and auth_identity_id != bootstrap_auth_user_id
        )
        or lower(email) != bootstrap_email
      )
  ) then
    raise exception 'bootstrap recusado: UUID/e-mail local conflita com a identidade central';
  end if;

  update app_arkom.profiles
  set auth_user_id = bootstrap_auth_user_id,
      auth_identity_id = coalesce(auth_identity_id, bootstrap_auth_user_id),
      full_name = bootstrap_full_name,
      email = bootstrap_email,
      role = 'admin',
      status = 'active',
      must_change_password = case
        when bootstrap_requires_password_change then 1 else 0
      end,
      session_version = session_version + 1
  where auth_user_id = bootstrap_auth_user_id
     or lower(email) = bootstrap_email;

  if not found then
    insert into app_arkom.profiles
      (auth_user_id, auth_identity_id, full_name, email, password_hash, role, status,
       must_change_password)
    values
      (bootstrap_auth_user_id, bootstrap_auth_user_id, bootstrap_full_name,
       bootstrap_email, null,
       'admin', 'active',
       case when bootstrap_requires_password_change then 1 else 0 end);
  end if;
end
$bootstrap$;
```

4. Para uma identidade nova, envie a recuperação de senha somente para esse
   e-mail pelo domínio canônico; o titular define a própria senha sem conhecer a
   temporária. Para uma identidade preexistente, pule esta etapa e preserve sua
   senha central. Depois do login, confirme UUID/e-mail no perfil local e emita
   uma nova sessão para verificar o claim `arkom_role=admin`; quando aplicável,
   confirme também `must_change_password = 0` após a troca.
5. Registre operador, UUID, e-mail, horário e resultado no log privado de mudança.
   Remova um usuário central em compensação somente se ele tiver sido criado por
   este procedimento. Nunca exclua uma identidade compartilhada preexistente; em
   falha parcial, bloqueie apenas o perfil Arkom e coordene a correção do vínculo.

## Checklist de Auth, URLs e entitlement para produção

- Desabilite **Allow new users to sign up** no Supabase Auth central. O cadastro
  de uma identidade nova pelo Arkom continua restrito a convite validado e
  operações server-side. Identidades já válidas no Auth central recebem acesso
  local como `student` no primeiro login, salvo claim Arkom `admin` preexistente.
- Configure `APP_URL` e `NEXT_PUBLIC_APP_URL` com a mesma origem HTTPS canônica.
  Na allowlist de redirects do Auth, autorize exatamente
  `https://app.arkom.ai/definir-senha` (ajuste apenas se o domínio oficial mudar),
  sem wildcard e sem localhost no projeto de produção.
- Mantenha `MEDIA_BUCKET=arkom-media` e `MEDIA_STORAGE_AUTH_MODE=rls`. O servidor
  rejeita outro bucket e também rejeita `service` quando `NODE_ENV=production`.
- O entitlement atual é deliberadamente conservador: `admin => Pro` e
  `student => Free`. Não promova student para Pro por default ou por estado do
  navegador; `NEXT_PUBLIC_ARKOM_ENABLE_DEMO_PLAN` deve permanecer `false` em
  produção. Um entitlement pago futuro precisa de fonte server-side própria.
- Valide login, recuperação, leitura/gravação do bucket e refresh de claim com
  contas reais de teste antes do go-live, sem reutilizar identidades de outros apps.

## Rollback

Não há rollback automático, porque remover schema ou bucket é destrutivo. Em
banco compartilhado, não execute `drop schema`, `delete storage.objects` ou
`delete storage.buckets` sem aprovação explícita do responsável e backup.

## Migration 0008 — paridade do schema `educacional` (superset)

`db/migrations/0008-central-parity.sql` **tem alvo diferente das demais**: ela
opera no schema **`educacional`** (NÃO em `app_arkom`), no mesmo banco físico
central. É o passo que torna o `educacional` um **superset** do `app_arkom`,
para o arkom-dash poder rodar sobre os dados reais do bilhon-ai
(`ARKOM_RUNTIME_SCHEMA=educacional`). As migrations `0001`–`0007` continuam
sendo o provisionamento de `app_arkom` e **não** devem ser aplicadas ao
`educacional`; a `0008` é a única deste diretório que escreve no `educacional`.

O que ela adiciona ao `educacional`, de forma **aditiva e idempotente**
(`if not exists` / DO-blocks guardados):

- as colunas de `profiles` que só existiam no `app_arkom`: `preferred_theme`
  (0005), `session_version` (0006) e `auth_identity_id` (0007);
- a integridade de identidade do 0007: índice único parcial, CHECK
  `profiles_auth_identity_consistent`, o trigger imutável +
  `prevent_auth_identity_reassignment()` e a função
  `set_central_arkom_claims(uuid,boolean,text,boolean,boolean)`;
- **um trigger `BEFORE INSERT OR UPDATE`** que faz
  `new.auth_identity_id := coalesce(new.auth_identity_id, new.auth_user_id)`
  **antes** do CHECK, para não quebrar o bilhon-ai vivo — que insere `profiles`
  com `auth_user_id` preenchido e `auth_identity_id` NULL. Com o trigger no
  lugar, todo INSERT do bilhon-ai chega ao CHECK já consistente, então o CHECK
  sempre vale e as escritas vivas continuam funcionando;
- a tabela `solution_previews` (paridade com o app_arkom) + os GRANTs de tabela
  para a role de runtime `educacional_app` (BYPASSRLS **não** dispensa GRANT de
  tabela).

Ela **não** cria roles nem policies (a role de runtime do `educacional`,
`educacional_app`, tem `BYPASSRLS`; policies são desnecessárias) e **não** altera
dados de negócio: a única escrita é popular a coluna recém-criada
`auth_identity_id` nas linhas existentes, o que **não muda a contagem de linhas**.

**Aplicação:** por um **operador autorizado com direitos de owner** no
`educacional`. As credenciais de runtime (`educacional_app`, `arkom_app_login`)
**não** têm permissão de DDL e não podem aplicá-la. Rode em uma única transação
com `ON_ERROR_STOP` e **capture o snapshot de contagens do `educacional`
(seção acima) antes e depois**, comparando linha a linha para provar zero perda
de dados. Não aplicar sem OK do dono. É reversível no nível do runtime apenas
revertendo as envs (`ARKOM_RUNTIME_SCHEMA`/`ARKOM_DATABASE_URL`/`MEDIA_BUCKET`);
os objetos aditivos no `educacional` são backward-compatíveis com o bilhon-ai.
