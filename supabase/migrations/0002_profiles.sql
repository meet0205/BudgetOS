-- 0002_profiles.sql
-- Feature 01 — Data foundation.
-- One row per user, mirroring auth.users. Carries locale/region and the OCR
-- review threshold used later by feature 08.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency char(3) not null default 'CAD',
  country char(2) not null default 'CA',
  province char(2) not null default 'NS',
  month_start_day smallint not null default 1
    check (month_start_day between 1 and 28),
  ocr_review_threshold numeric(3,2) not null default 0.80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at maintenance trigger, reused across tables.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();
