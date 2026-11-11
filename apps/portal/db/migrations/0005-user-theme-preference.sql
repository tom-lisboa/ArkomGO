set search_path = app_arkom;

alter table profiles
  add column if not exists preferred_theme text;

alter table profiles
  drop constraint if exists profiles_preferred_theme_check;

alter table profiles
  add constraint profiles_preferred_theme_check
  check (preferred_theme is null or preferred_theme in ('light', 'dark'));

