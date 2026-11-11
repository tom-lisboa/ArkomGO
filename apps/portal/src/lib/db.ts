import postgres from "postgres";
import { seed } from "@/db/seed";

const globalForDb = globalThis as unknown as {
  __arkomSql?: ReturnType<typeof postgres>;
  __arkomReadyPromise?: Promise<void>;
  __arkomSeedPromise?: Promise<void>;
  __educacionalSql?: ReturnType<typeof postgres>;
};

const DEFAULT_RUNTIME_SCHEMA = "app_arkom";

/** Schema do runtime transacional do arkom-dash. Config, nao codigo: default
 *  `app_arkom` (schema demo do arkom); no corte para o banco central, defina
 *  `ARKOM_RUNTIME_SCHEMA=educacional` para rodar sobre os dados reais do
 *  bilhon-ai. O valor precisa ser um identificador de schema simples. */
export function runtimeSchema(): string {
  const configured = process.env.ARKOM_RUNTIME_SCHEMA?.trim();
  if (!configured) return DEFAULT_RUNTIME_SCHEMA;
  if (!/^[a-z_][a-z0-9_]*$/.test(configured)) {
    throw new Error(
      "ARKOM_RUNTIME_SCHEMA invalido: use um identificador de schema simples (ex.: app_arkom ou educacional).",
    );
  }
  return configured;
}

/** Conexão ao schema `educacional` (schema compartilhado do central) — usada pelo
 *  Genesis/builder, cujas tabelas (`builder_prompt_configs`, `builder_solutions`,
 *  `builder_step_generations`) vivem lá, não em `app_arkom`. */
export function getEducacionalSql() {
  if (globalForDb.__educacionalSql) return globalForDb.__educacionalSql;

  const databaseUrl = process.env.EDUCACIONAL_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("EDUCACIONAL_DATABASE_URL is required (Genesis/builder)");
  }

  const sql = postgres(databaseUrl, {
    connection: { search_path: "educacional" },
    ssl: "require",
    types: {
      bigint: { to: 20, from: [20], serialize: (v: unknown) => String(v), parse: Number },
      numeric: { to: 1700, from: [1700], serialize: (v: unknown) => String(v), parse: Number },
    },
    max: 3,
  });

  globalForDb.__educacionalSql = sql;
  return sql;
}

export function getSql() {
  if (globalForDb.__arkomSql) return globalForDb.__arkomSql;

  const databaseUrl = process.env.ARKOM_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("ARKOM_DATABASE_URL is required");
  }

  const sql = postgres(databaseUrl, {
    connection: { search_path: runtimeSchema() },
    ssl: "require",
    types: {
      bigint: { to: 20, from: [20], serialize: (v: unknown) => String(v), parse: Number },
      numeric: { to: 1700, from: [1700], serialize: (v: unknown) => String(v), parse: Number },
    },
    max: 5,
  });

  globalForDb.__arkomSql = sql;
  return sql;
}

const lazySqlTarget = (() => undefined) as unknown as ReturnType<typeof postgres>;

export const sql = new Proxy(lazySqlTarget, {
  apply(_target, _thisArg, argArray) {
    return getSql()(...(argArray as Parameters<ReturnType<typeof postgres>>));
  },
  get(_target, prop) {
    return Reflect.get(getSql(), prop);
  },
}) as ReturnType<typeof postgres>;

export async function ensureDatabaseReady(): Promise<void> {
  if (globalForDb.__arkomReadyPromise) return globalForDb.__arkomReadyPromise;

  globalForDb.__arkomReadyPromise = (async () => {
    const schema = runtimeSchema();
    if (schema === DEFAULT_RUNTIME_SCHEMA) {
      await ensureAppArkomReady();
    } else {
      await ensureConfiguredSchemaReady(schema);
    }
  })();

  return globalForDb.__arkomReadyPromise;
}

/** Modo `app_arkom` (schema dedicado do arkom): mantem, byte a byte, as
 *  checagens originais -- role membro exclusivo de `arkom_runtime`, sem
 *  BYPASSRLS/ownership, 16 policies runtime, etc. */
async function ensureAppArkomReady(): Promise<void> {
  {
    const sql = getSql();
    const [state] = await sql<{
      table_count: number;
      profile_column_count: number;
      password_hash_nullable: boolean;
      identity_integrity_ready: boolean;
      runtime_policy_count: number;
      runtime_role_safe: boolean;
      runtime_inherited_role_count: number;
      runtime_member: boolean;
      runtime_membership_count: number;
      runtime_privileged: boolean;
      runtime_owns_tables: boolean;
    }[]>`
      WITH required_tables(table_name) AS (
        VALUES
          ('profiles'),
          ('invites'),
          ('courses'),
          ('course_modules'),
          ('lessons'),
          ('lesson_resources'),
          ('lesson_progress'),
          ('lesson_likes'),
          ('lesson_ratings'),
          ('mentorship_events'),
          ('event_confirmations'),
          ('app_categories'),
          ('apps'),
          ('app_ratings'),
          ('app_clicks'),
          ('course_access_logs')
      ), active_login_role AS (
        SELECT oid, rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = current_user
      )
      SELECT
        (
          SELECT COUNT(*)
          FROM required_tables required
          JOIN information_schema.tables actual
            ON actual.table_schema = 'app_arkom'
           AND actual.table_name = required.table_name
           AND actual.table_type = 'BASE TABLE'
        ) AS table_count,
        (
          SELECT COUNT(*)
          FROM information_schema.columns
          WHERE table_schema = 'app_arkom'
            AND table_name = 'profiles'
            AND column_name IN (
              'auth_user_id',
              'auth_identity_id',
              'must_change_password',
              'password_hash',
              'preferred_theme',
              'session_version'
            )
        ) AS profile_column_count,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'app_arkom'
            AND table_name = 'profiles'
            AND column_name = 'password_hash'
            AND is_nullable = 'YES'
        ) AS password_hash_nullable,
        (
          EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = to_regclass('app_arkom.profiles')
              AND conname = 'profiles_auth_identity_consistent'
          )
          AND EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgrelid = to_regclass('app_arkom.profiles')
              AND tgname = 'profiles_auth_identity_immutable'
              AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1
            FROM pg_proc
            WHERE oid = to_regprocedure(
              'app_arkom.set_central_arkom_claims(uuid,boolean,text,boolean,boolean)'
            )
              AND has_function_privilege(current_user, oid, 'EXECUTE')
          )
        ) AS identity_integrity_ready,
        (
          -- Conta as policies das 16 tabelas OBRIGATÓRIAS. Antes contava todas as do
          -- schema, o que fazia qualquer tabela nova (ex.: solution_sessions, 0009)
          -- derrubar a checagem. O invariante que importa continua exato: cada tabela
          -- obrigatória tem a sua policy de runtime.
          SELECT COUNT(*)
          FROM pg_policies
          JOIN required_tables required ON required.table_name = pg_policies.tablename
          WHERE schemaname = 'app_arkom'
            AND policyname = 'arkom runtime full access'
            AND 'arkom_runtime' = ANY(roles)
        ) AS runtime_policy_count,
        EXISTS (
          SELECT 1
          FROM pg_roles
          WHERE rolname = 'arkom_runtime'
            AND NOT rolcanlogin
            AND NOT rolsuper
            AND NOT rolcreatedb
            AND NOT rolcreaterole
            AND NOT rolreplication
            AND NOT rolbypassrls
            AND shobj_description(oid, 'pg_authid') =
              'Managed exclusively by Arkom app_arkom migration 0001'
        ) AS runtime_role_safe,
        (
          SELECT COUNT(*)
          FROM pg_auth_members membership
          JOIN pg_roles member_role ON member_role.oid = membership.member
          WHERE member_role.rolname = 'arkom_runtime'
        ) AS runtime_inherited_role_count,
        EXISTS (
          SELECT 1
          FROM pg_roles runtime_role
          CROSS JOIN active_login_role
          WHERE runtime_role.rolname = 'arkom_runtime'
            AND pg_has_role(active_login_role.oid, runtime_role.oid, 'member')
        ) AS runtime_member,
        (
          SELECT COUNT(*)
          FROM pg_auth_members membership
          JOIN active_login_role
            ON active_login_role.oid = membership.member
        ) AS runtime_membership_count,
        EXISTS (
          SELECT 1
          FROM active_login_role
          WHERE rolsuper OR rolbypassrls
        ) AS runtime_privileged,
        EXISTS (
          SELECT 1
          FROM pg_tables
          WHERE schemaname = 'app_arkom'
            AND tableowner = current_user
        ) AS runtime_owns_tables
    `;

    if (!state || state.table_count !== 16) {
      throw new Error(
        "Schema app_arkom nao provisionado. Aplique as migrations 0001, 0002, 0003, 0005, 0006 e 0007 conforme db/migrations/README.md.",
      );
    }
    if (
      state.profile_column_count !== 6 ||
      !state.password_hash_nullable ||
      !state.identity_integrity_ready
    ) {
      throw new Error(
        "Schema app_arkom incompleto. Reaplique o lote atomico de migrations conforme db/migrations/README.md.",
      );
    }
    if (
      state.runtime_policy_count !== 16 ||
      !state.runtime_role_safe ||
      state.runtime_inherited_role_count !== 0
    ) {
      throw new Error(
        "Role/policies runtime do app_arkom invalidas. Interrompa o rollout e revise a migration 0001.",
      );
    }
    if (
      !state.runtime_member ||
      state.runtime_membership_count !== 1 ||
      state.runtime_privileged ||
      state.runtime_owns_tables
    ) {
      throw new Error(
        "ARKOM_DATABASE_URL deve usar uma role LOGIN dedicada, membro apenas de arkom_runtime, sem ownership, SUPERUSER ou BYPASSRLS.",
      );
    }
  }
}

/** Modo schema compartilhado (ex.: `educacional`, onde vivem os dados reais do
 *  bilhon-ai): a role de runtime (`educacional_app`) tem BYPASSRLS, entao NAO
 *  exigimos associacao a `arkom_runtime`, policies, ownership nem ausencia de
 *  BYPASSRLS. Mantemos, contra o schema configurado, a checagem das 16 tabelas,
 *  as colunas obrigatorias de `profiles`, `password_hash` nullable e a paridade
 *  central (CHECK/trigger de identidade + `set_central_arkom_claims`) aplicada
 *  pela migration 0008. Falha alto se a paridade nao estiver no lugar. */
async function ensureConfiguredSchemaReady(schema: string): Promise<void> {
  const sql = getSql();
  const profilesRegclass = `${schema}.profiles`;
  const setClaimsSignature = `${schema}.set_central_arkom_claims(uuid,boolean,text,boolean,boolean)`;

  const [state] = await sql<{
    table_count: number;
    profile_column_count: number;
    password_hash_nullable: boolean;
    identity_integrity_ready: boolean;
    set_claims_ready: boolean;
  }[]>`
    WITH required_tables(table_name) AS (
      VALUES
        ('profiles'),
        ('invites'),
        ('courses'),
        ('course_modules'),
        ('lessons'),
        ('lesson_resources'),
        ('lesson_progress'),
        ('lesson_likes'),
        ('lesson_ratings'),
        ('mentorship_events'),
        ('event_confirmations'),
        ('app_categories'),
        ('apps'),
        ('app_ratings'),
        ('app_clicks'),
        ('course_access_logs')
    )
    SELECT
      (
        SELECT COUNT(*)
        FROM required_tables required
        JOIN information_schema.tables actual
          ON actual.table_schema = ${schema}
         AND actual.table_name = required.table_name
         AND actual.table_type = 'BASE TABLE'
      ) AS table_count,
      (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'profiles'
          AND column_name IN (
            'auth_user_id',
            'auth_identity_id',
            'must_change_password',
            'password_hash',
            'preferred_theme',
            'session_version'
          )
      ) AS profile_column_count,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = 'profiles'
          AND column_name = 'password_hash'
          AND is_nullable = 'YES'
      ) AS password_hash_nullable,
      (
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = to_regclass(${profilesRegclass})
            AND conname = 'profiles_auth_identity_consistent'
        )
        AND EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgrelid = to_regclass(${profilesRegclass})
            AND tgname = 'profiles_auth_identity_immutable'
            AND NOT tgisinternal
        )
      ) AS identity_integrity_ready,
      EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE oid = to_regprocedure(${setClaimsSignature})
          AND has_function_privilege(current_user, oid, 'EXECUTE')
      ) AS set_claims_ready
  `;

  if (!state || state.table_count !== 16) {
    throw new Error(
      `Schema ${schema} nao provisionado: faltam tabelas educacionais. Aplique db/migrations/0008-central-parity.sql conforme db/migrations/README.md.`,
    );
  }
  if (
    state.profile_column_count !== 6 ||
    !state.password_hash_nullable ||
    !state.identity_integrity_ready ||
    !state.set_claims_ready
  ) {
    throw new Error(
      `Schema ${schema} sem a paridade central (colunas de profiles, CHECK/trigger de identidade ou set_central_arkom_claims). Aplique db/migrations/0008-central-parity.sql (BLOCO A) conforme db/migrations/README.md.`,
    );
  }
}

export async function ensureSeeded(): Promise<void> {
  await ensureDatabaseReady();
  if (process.env.ARKOM_AUTO_SEED !== "true") return;

  const environment = process.env.NODE_ENV;
  if (environment !== "development" && environment !== "test") {
    throw new Error(
      "ARKOM_AUTO_SEED=true is allowed only when NODE_ENV is development or test",
    );
  }

  if (globalForDb.__arkomSeedPromise) return globalForDb.__arkomSeedPromise;

  globalForDb.__arkomSeedPromise = (async () => {
    const sql = getSql();
    const [{ count }] = await sql<{ count: number }[]>`SELECT COUNT(*) AS count FROM profiles`;
    if (count === 0) {
      console.log("[arkom] Schema app_arkom vazio - executando seed de demonstracao...");
      await seed(sql);
      console.log("[arkom] Seed concluido.");
    }
  })();

  return globalForDb.__arkomSeedPromise;
}
