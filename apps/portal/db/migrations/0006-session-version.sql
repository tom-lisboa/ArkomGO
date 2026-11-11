set search_path = app_arkom;

alter table profiles
  add column if not exists session_version integer not null default 1
  check (session_version > 0);
