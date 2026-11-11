-- Additive directory: product databases and existing customer IDs are preserved.
CREATE SCHEMA IF NOT EXISTS platform_directory;
CREATE TABLE IF NOT EXISTS platform_directory.customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), namespace text NOT NULL, reference text NOT NULL,
 name text NOT NULL, enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1,
 UNIQUE(namespace,reference)
);
CREATE TABLE IF NOT EXISTS platform_directory.organizations (
 id uuid PRIMARY KEY REFERENCES public.platform_organizations(id),
 customer_id uuid NOT NULL REFERENCES platform_directory.customers(id),
 namespace text NOT NULL, reference text NOT NULL,
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1,
 UNIQUE(namespace,reference)
);
CREATE TABLE IF NOT EXISTS platform_directory.people (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS platform_directory.identities (
 namespace text NOT NULL, subject text NOT NULL,
 person_id uuid NOT NULL REFERENCES platform_directory.people(id),
 PRIMARY KEY(namespace,subject)
);
CREATE TABLE IF NOT EXISTS platform_directory.memberships (
 organization_id uuid NOT NULL REFERENCES platform_directory.organizations(id),
 person_id uuid NOT NULL REFERENCES platform_directory.people(id),
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(organization_id,person_id)
);
CREATE TABLE IF NOT EXISTS platform_directory.entitlements (
 organization_id uuid NOT NULL REFERENCES platform_directory.organizations(id),
 solution text NOT NULL CHECK(solution IN ('clips','social','finance','bia-sdr')),
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(organization_id,solution)
);
CREATE TABLE IF NOT EXISTS platform_directory.backends (
 id text PRIMARY KEY, solution text NOT NULL CHECK(solution IN ('clips','social','finance','bia-sdr')),
 UNIQUE(id,solution)
);
CREATE TABLE IF NOT EXISTS platform_directory.backend_organizations (
 backend text NOT NULL, solution text NOT NULL, organization_id uuid NOT NULL,
 local_organization_id text NOT NULL,
 FOREIGN KEY(backend,solution) REFERENCES platform_directory.backends(id,solution),
 FOREIGN KEY(organization_id,solution) REFERENCES platform_directory.entitlements(organization_id,solution),
 PRIMARY KEY(backend,organization_id), UNIQUE(backend,local_organization_id),
 UNIQUE(backend,organization_id,solution)
);
CREATE TABLE IF NOT EXISTS platform_directory.grants (
 organization_id uuid NOT NULL, person_id uuid NOT NULL, solution text NOT NULL,
 role text NOT NULL CHECK(role IN ('viewer','operator','admin')),
 enabled boolean NOT NULL DEFAULT true, revision bigint NOT NULL DEFAULT 1,
 FOREIGN KEY(organization_id,person_id) REFERENCES platform_directory.memberships(organization_id,person_id),
 FOREIGN KEY(organization_id,solution) REFERENCES platform_directory.entitlements(organization_id,solution),
 PRIMARY KEY(organization_id,person_id,solution)
);
CREATE TABLE IF NOT EXISTS platform_directory.bindings (
 backend text NOT NULL, organization_id uuid NOT NULL, solution text NOT NULL,
 local_actor_id text NOT NULL, person_id uuid NOT NULL,
 FOREIGN KEY(backend,organization_id,solution) REFERENCES platform_directory.backend_organizations(backend,organization_id,solution),
 FOREIGN KEY(organization_id,person_id,solution) REFERENCES platform_directory.grants(organization_id,person_id,solution),
 PRIMARY KEY(backend,organization_id,local_actor_id), UNIQUE(backend,organization_id,person_id)
);
CREATE TABLE IF NOT EXISTS platform_directory.service_bindings (
 client_id uuid PRIMARY KEY REFERENCES public.integration_clients(id),
 backend text NOT NULL REFERENCES platform_directory.backends(id)
);
CREATE TABLE IF NOT EXISTS platform_directory.requests (
 namespace text NOT NULL, key text NOT NULL, fingerprint text NOT NULL,
 response jsonb NOT NULL, PRIMARY KEY(namespace,key)
);
CREATE TABLE IF NOT EXISTS platform_directory.audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 action text NOT NULL, target jsonb NOT NULL, reason text NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_directory.backend_endpoints (
 backend text PRIMARY KEY REFERENCES platform_directory.backends(id), api_url text NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_directory.installation_origins (
 origin text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES platform_directory.organizations(id),
 verification_reference text NOT NULL, UNIQUE(origin,organization_id)
);
CREATE TABLE IF NOT EXISTS platform_directory.installations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 backend text NOT NULL, solution text NOT NULL, origin text NOT NULL,
 source_reference text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(backend,organization_id,solution) REFERENCES platform_directory.backend_organizations(backend,organization_id,solution),
 FOREIGN KEY(origin,organization_id) REFERENCES platform_directory.installation_origins(origin,organization_id),
 UNIQUE(backend,source_reference,origin)
);
