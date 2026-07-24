-- 0013_tax.sql
-- Feature 05 — Canadian tax estimation (PLANNING ESTIMATE, not a filing).
-- Brackets and rates are data with provenance, resolved by the year income was
-- earned, never hardcoded. Self-employment is always taxed on combined income at
-- the marginal rate; self-employed CPP is doubled and shown on its own line.
-- Every displayed figure is labelled an estimate; the app never states what the
-- user owes CRA.

create table tax_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country char(2) not null default 'CA',
  province char(2),
  tax_year int not null,
  brackets jsonb not null,
  basic_personal_amount_minor bigint not null,
  low_income_reduction jsonb,
  source_url text,
  verified_on date,
  unique (country, province, tax_year)
);

create table contribution_rules (
  id uuid primary key default gen_random_uuid(),
  tax_year int not null,
  kind text not null,
  rate numeric(6,5) not null,
  max_pensionable_minor bigint,
  exemption_minor bigint,
  self_employed_multiplier numeric(3,1) not null default 1.0,
  source_url text,
  verified_on date,
  unique (tax_year, kind)
);

create table tax_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year int not null,
  province char(2) not null,
  as_of date not null,
  employment_gross_minor bigint not null default 0,
  self_employment_net_minor bigint not null default 0,
  other_income_minor bigint not null default 0,
  projected_annual_minor bigint not null,
  annual_override_minor bigint,
  est_federal_tax_minor bigint not null,
  est_provincial_tax_minor bigint not null,
  est_cpp_minor bigint not null,
  est_cpp_self_employed_minor bigint not null default 0,
  est_ei_minor bigint not null,
  already_withheld_minor bigint not null default 0,
  instalments_paid_minor bigint not null default 0,
  shortfall_minor bigint not null,
  reserve_multiplier numeric(3,2) not null default 1.10,
  reserve_target_minor bigint not null,
  requires_instalments boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (user_id, tax_year, as_of)
);

create table tax_instalments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year int not null,
  due_date date not null,
  amount_minor bigint not null,
  paid_on date,
  paid_amount_minor bigint,
  kind text not null default 'income_tax'
);

-- Reference tables (tax_jurisdictions, contribution_rules) are system data,
-- readable by all authenticated users; only per-user tables get owner RLS.
alter table tax_estimates enable row level security;
create policy owner on tax_estimates
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table tax_instalments enable row level security;
create policy owner on tax_instalments
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
