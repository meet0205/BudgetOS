-- 0009_income.sql
-- Feature 04 — Manual income entry.
-- Income arrives in two shapes: employment (net, deductions withheld and
-- printed on the stub) and self-employment (gross, nothing withheld). The
-- reconcile check (gross - deductions = net) is enforced in application code
-- because it differs by income_kind; `reconciles` is persisted so Feature 05
-- can exclude unbalanced records. Deduction `kind` is a controlled vocabulary
-- (see packages/core DeductionKind) — text here, validated in the app.

create type income_doc_type as enum
  ('payslip','t4','t4a','t5','invoice','uber_summary','manual');

create type income_kind as enum
  ('employment','self_employment','investment','rental','other');

create table income_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type income_doc_type not null,
  income_kind income_kind not null,
  source_file_id uuid,
  employer_name text,
  employer_id text,
  period_start date,
  period_end date,
  pay_date date not null,
  tax_year int not null,
  province char(2) not null,
  gross_minor bigint not null,
  net_minor bigint,
  ytd_gross_minor bigint,
  ytd_net_minor bigint,
  platform_fees_minor bigint not null default 0,
  hst_collected_minor bigint not null default 0,
  currency_code char(3) not null default 'CAD',
  is_user_entered boolean not null default true,
  reconciles boolean not null default false,
  parser_version text,
  ocr_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on income_documents (user_id, tax_year, pay_date desc)
  where deleted_at is null;
create index on income_documents (user_id, income_kind, tax_year)
  where deleted_at is null;

create table income_deductions (
  id uuid primary key default gen_random_uuid(),
  income_document_id uuid not null
    references income_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  raw_label text,
  amount_minor bigint not null,
  ytd_amount_minor bigint,
  is_user_entered boolean not null default true
);
create index on income_deductions (income_document_id);

create table income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  income_kind income_kind not null,
  employer_id text,
  typical_gross_minor bigint,
  pay_frequency text,
  last_used_at timestamptz,
  unique (user_id, name)
);

alter table income_documents enable row level security;
create policy owner on income_documents
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table income_deductions enable row level security;
create policy owner on income_deductions
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table income_sources enable row level security;
create policy owner on income_sources
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
