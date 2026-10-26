-- AERVELYS OPS 5.0 controlled identity and evidence staging.
-- Source DB is READ ONLY. No public salary, medical or license-document data.
alter table public.employees
 add column if not exists legacy_source_id uuid,
 add column if not exists legacy_source_table text check (legacy_source_table in ('crew','dispatch_staff')),
 add column if not exists hire_date date,
 add column if not exists source_duty_status text,
 add column if not exists is_owner_pilot boolean not null default false;
create unique index if not exists employees_legacy_source_unique
 on public.employees(organization_id,legacy_source_table,legacy_source_id)
 where legacy_source_id is not null;
alter table public.crew_qualifications
 add column if not exists legacy_source_id uuid,
 add column if not exists legacy_source_table text,
 add column if not exists source_review_note text;
create unique index if not exists crew_qualification_legacy_source_unique
 on public.crew_qualifications(organization_id,legacy_source_table,legacy_source_id)
 where legacy_source_id is not null;
create schema if not exists ops_private;
revoke all on schema ops_private from public,anon,authenticated;
create table if not exists ops_private.employee_compliance (
 employee_id uuid primary key references public.employees(id) on delete restrict,
 legacy_medical_valid_until date,
 record_source text not null,
 verified_for_operations boolean not null default false,
 imported_at timestamptz not null default now()
);
create table if not exists ops_private.qualification_evidence (
 qualification_id uuid primary key references public.crew_qualifications(id) on delete restrict,
 line_check_valid_until date,
 operator_check_valid_until date,
 licence_valid_until date,
 source_recorded_active boolean,
 source_reference text,
 verified_for_operations boolean not null default false,
 imported_at timestamptz not null default now()
);
create table if not exists ops_private.employee_terms (
 employee_id uuid primary key references public.employees(id) on delete restrict,
 legacy_contract_start date,
 contract_type text,
 employment_fraction numeric(5,2),
 monthly_gross_sim_eur numeric(14,2),
 annual_leave_days integer,
 home_base_source text,
 simulation_only boolean not null default true,
 record_source text not null,
 imported_at timestamptz not null default now()
);
create table if not exists ops_private.employee_leave_entitlements (
 employee_id uuid not null references public.employees(id) on delete restrict,
 leave_year integer not null,
 base_days integer,
 carryover_days integer,
 adjustment_days integer,
 record_source text not null,
 imported_at timestamptz not null default now(),
 primary key(employee_id,leave_year)
);
create table if not exists ops_private.crew_credential_evidence (
 legacy_id uuid primary key,
 employee_id uuid not null references public.employees(id) on delete restrict,
 credential_type text not null,
 aircraft_registration text,
 valid_from date,
 valid_until date,
 source_status text,
 source_reference text,
 verified_for_operations boolean not null default false,
 imported_at timestamptz not null default now()
);
create index if not exists crew_credential_employee_idx on ops_private.crew_credential_evidence(employee_id,credential_type);
alter table ops_private.employee_compliance enable row level security;
alter table ops_private.qualification_evidence enable row level security;
alter table ops_private.employee_terms enable row level security;
alter table ops_private.employee_leave_entitlements enable row level security;
alter table ops_private.crew_credential_evidence enable row level security;
revoke all on all tables in schema ops_private from public,anon,authenticated;
comment on schema ops_private is 'Restricted legacy evidence; never expose in Supabase Data API';
comment on column public.employees.employment_status is 'draft for all imported employee identities until independently verified; legacy status is separate';
comment on column public.crew_qualifications.status is 'draft until operator, licence, medical, checks and duty constraints are reviewed';
