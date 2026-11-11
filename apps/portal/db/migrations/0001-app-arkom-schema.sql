create schema if not exists app_arkom;

set search_path = app_arkom;

create table if not exists profiles (
  id integer generated always as identity primary key,
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  avatar_url text,
  role text not null default 'student' check (role in ('admin', 'student')),
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  preferred_theme text check (preferred_theme is null or preferred_theme in ('light', 'dark')),
  registered_at text not null default (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

create unique index if not exists idx_profiles_lower_email on profiles (lower(email));

create table if not exists invites (
  id integer generated always as identity primary key,
  code text not null unique,
  email text,
  role text not null default 'student' check (role in ('admin', 'student')),
  status text not null default 'unused' check (status in ('unused', 'used', 'expired', 'revoked')),
  created_by integer references profiles(id),
  used_by integer references profiles(id),
  used_at text,
  expires_at text,
  created_at text not null default (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

create table if not exists courses (
  id integer generated always as identity primary key,
  title text not null,
  description text,
  cover_url text,
  release_type text not null default 'immediate' check (release_type in ('immediate', 'after_days')),
  release_after_days integer not null default 0,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by integer references profiles(id),
  created_at text not null default (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

create table if not exists course_modules (
  id integer generated always as identity primary key,
  course_id integer not null references courses(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published'))
);

create table if not exists lessons (
  id integer generated always as identity primary key,
  course_id integer not null references courses(id) on delete cascade,
  module_id integer not null references course_modules(id) on delete cascade,
  title text not null,
  description text,
  video_provider text not null default 'youtube' check (video_provider in ('youtube', 'panda')),
  video_url text not null,
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published'))
);

create table if not exists lesson_resources (
  id integer generated always as identity primary key,
  lesson_id integer not null references lessons(id) on delete cascade,
  title text not null,
  resource_type text not null default 'external_link' check (resource_type in ('pdf', 'image', 'zip', 'external_link')),
  url text not null,
  sort_order integer not null default 0
);

create table if not exists lesson_progress (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  lesson_id integer not null references lessons(id) on delete cascade,
  completed integer not null default 0 check (completed in (0, 1)),
  completed_at text,
  unique (user_id, lesson_id)
);

create table if not exists lesson_likes (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  lesson_id integer not null references lessons(id) on delete cascade,
  liked integer not null default 1 check (liked in (0, 1)),
  unique (user_id, lesson_id)
);

create table if not exists lesson_ratings (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  lesson_id integer not null references lessons(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  unique (user_id, lesson_id)
);

create table if not exists mentorship_events (
  id integer generated always as identity primary key,
  title text not null,
  description text,
  cover_url text,
  event_date text not null,
  starts_at text not null,
  ends_at text,
  redirect_url text,
  recurrence_type text not null default 'none' check (recurrence_type in ('none', 'daily', 'weekly')),
  recurrence_until text,
  status text not null default 'published' check (status in ('draft', 'published')),
  created_by integer references profiles(id)
);

create table if not exists event_confirmations (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  event_id integer not null references mentorship_events(id) on delete cascade,
  confirmed integer not null default 1 check (confirmed in (0, 1)),
  confirmed_at text,
  unique (user_id, event_id)
);

create table if not exists app_categories (
  id integer generated always as identity primary key,
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'published'))
);

create table if not exists apps (
  id integer generated always as identity primary key,
  category_id integer not null references app_categories(id),
  title text not null,
  tagline text,
  description text,
  cover_url text,
  video_provider text check (video_provider in ('youtube', 'panda')),
  video_url text,
  button_label text not null default 'Acessar',
  redirect_url text not null,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by integer references profiles(id)
);

create table if not exists app_ratings (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  app_id integer not null references apps(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  unique (user_id, app_id)
);

create table if not exists app_clicks (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  app_id integer not null references apps(id) on delete cascade,
  clicked_at text not null default (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

create table if not exists course_access_logs (
  id integer generated always as identity primary key,
  user_id integer not null references profiles(id) on delete cascade,
  course_id integer not null references courses(id) on delete cascade,
  accessed_at text not null default (to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

create index if not exists idx_lessons_course on lessons(course_id);
create index if not exists idx_lessons_module on lessons(module_id);
create index if not exists idx_progress_user on lesson_progress(user_id);
create index if not exists idx_progress_lesson on lesson_progress(lesson_id);
create index if not exists idx_events_date on mentorship_events(event_date);
create index if not exists idx_app_clicks_app on app_clicks(app_id);
create index if not exists idx_access_logs_course on course_access_logs(course_id);

-- Group role for the trusted direct-Postgres application connection. It never
-- receives a password/login here; the operator grants membership to a separate
-- LOGIN role whose credential lives only in ARKOM_DATABASE_URL.
do $arkom_runtime_role$
declare
  expected_comment constant text := 'Managed exclusively by Arkom app_arkom migration 0001';
  existing_comment text;
begin
  if not exists (select 1 from pg_roles where rolname = 'arkom_runtime') then
    create role arkom_runtime
      nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    execute format('comment on role arkom_runtime is %L', expected_comment);
  else
    select shobj_description(oid, 'pg_authid')
    into existing_comment
    from pg_roles
    where rolname = 'arkom_runtime';

    if existing_comment is distinct from expected_comment then
      raise exception
        'role arkom_runtime already exists without the Arkom ownership marker';
    end if;
  end if;

  if exists (
    select 1
    from pg_auth_members
    where member = (select oid from pg_roles where rolname = 'arkom_runtime')
  ) then
    raise exception 'role arkom_runtime must not inherit any other role';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname = 'arkom_runtime'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'role arkom_runtime has unsafe attributes';
  end if;
end
$arkom_runtime_role$;

alter table app_arkom.profiles enable row level security;
alter table app_arkom.invites enable row level security;
alter table app_arkom.courses enable row level security;
alter table app_arkom.course_modules enable row level security;
alter table app_arkom.lessons enable row level security;
alter table app_arkom.lesson_resources enable row level security;
alter table app_arkom.lesson_progress enable row level security;
alter table app_arkom.lesson_likes enable row level security;
alter table app_arkom.lesson_ratings enable row level security;
alter table app_arkom.mentorship_events enable row level security;
alter table app_arkom.event_confirmations enable row level security;
alter table app_arkom.app_categories enable row level security;
alter table app_arkom.apps enable row level security;
alter table app_arkom.app_ratings enable row level security;
alter table app_arkom.app_clicks enable row level security;
alter table app_arkom.course_access_logs enable row level security;

drop policy if exists "arkom runtime full access" on app_arkom.profiles;
create policy "arkom runtime full access" on app_arkom.profiles
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.invites;
create policy "arkom runtime full access" on app_arkom.invites
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.courses;
create policy "arkom runtime full access" on app_arkom.courses
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.course_modules;
create policy "arkom runtime full access" on app_arkom.course_modules
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.lessons;
create policy "arkom runtime full access" on app_arkom.lessons
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.lesson_resources;
create policy "arkom runtime full access" on app_arkom.lesson_resources
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.lesson_progress;
create policy "arkom runtime full access" on app_arkom.lesson_progress
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.lesson_likes;
create policy "arkom runtime full access" on app_arkom.lesson_likes
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.lesson_ratings;
create policy "arkom runtime full access" on app_arkom.lesson_ratings
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.mentorship_events;
create policy "arkom runtime full access" on app_arkom.mentorship_events
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.event_confirmations;
create policy "arkom runtime full access" on app_arkom.event_confirmations
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.app_categories;
create policy "arkom runtime full access" on app_arkom.app_categories
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.apps;
create policy "arkom runtime full access" on app_arkom.apps
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.app_ratings;
create policy "arkom runtime full access" on app_arkom.app_ratings
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.app_clicks;
create policy "arkom runtime full access" on app_arkom.app_clicks
  for all to arkom_runtime using (true) with check (true);
drop policy if exists "arkom runtime full access" on app_arkom.course_access_logs;
create policy "arkom runtime full access" on app_arkom.course_access_logs
  for all to arkom_runtime using (true) with check (true);

revoke all on schema app_arkom from public;
revoke all on schema app_arkom from anon, authenticated;
revoke all on all tables in schema app_arkom from public;
revoke all on all tables in schema app_arkom from anon, authenticated;
revoke all on all sequences in schema app_arkom from public;
revoke all on all sequences in schema app_arkom from anon, authenticated;
revoke all on all functions in schema app_arkom from public;
revoke all on all functions in schema app_arkom from anon, authenticated;
alter default privileges in schema app_arkom revoke all on tables from public;
alter default privileges in schema app_arkom revoke all on tables from anon, authenticated;
alter default privileges in schema app_arkom revoke all on sequences from public;
alter default privileges in schema app_arkom revoke all on sequences from anon, authenticated;
alter default privileges in schema app_arkom revoke all on functions from public;
alter default privileges in schema app_arkom revoke all on functions from anon, authenticated;

grant usage on schema app_arkom to arkom_runtime;
grant select, insert, update, delete on all tables in schema app_arkom to arkom_runtime;
grant usage, select on all sequences in schema app_arkom to arkom_runtime;
alter default privileges in schema app_arkom
  grant select, insert, update, delete on tables to arkom_runtime;
alter default privileges in schema app_arkom
  grant usage, select on sequences to arkom_runtime;
