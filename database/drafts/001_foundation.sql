-- AERVELYS OPS 5.0 — UNAPPLIED DESIGN DRAFT
-- Only for a newly provisioned, dedicated Supabase project.
-- DO NOT execute against the existing AERVELYS OPS project.
-- Before application: generate a named migration with Supabase CLI, review, test on isolated DB.
create extension if not exists btree_gist;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  registration text not null,
  aircraft_type text not null,
  home_base_icao text not null check (home_base_icao ~ '^[A-Z0-9]{4}$'),
  current_icao text check (current_icao ~ '^[A-Z0-9]{4}$'),
  operational_status text not null default 'inactive'
    check (operational_status in ('inactive','available','reserved','maintenance','grounded')),
  created_at timestamptz not null default now(),
  unique (organization_id, registration)
);
create index aircraft_org_idx on public.aircraft(organization_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_code text not null,
  display_name text not null,
  department text not null,
  employment_status text not null default 'draft'
    check (employment_status in ('draft','active','leave','inactive')),
  created_at timestamptz not null default now(),
  unique (organization_id, employee_code)
);
create index employees_org_idx on public.employees(organization_id);

create table public.simulation_clock (
  organization_id uuid primary key references public.organizations(id),
  sim_now timestamptz not null,
  mode text not null default 'stopped' check (mode in ('stopped','paused','running')),
  updated_at timestamptz not null default now()
);

create table public.resource_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid not null references public.aircraft(id),
  reservation_kind text not null check (reservation_kind in ('flight','positioning','maintenance')),
  state text not null default 'option' check (state in ('option','confirmed','operational_lock','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source_reference text not null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  constraint no_overlap_confirmed_aircraft exclude using gist
  (aircraft_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (state in ('confirmed','operational_lock'))
);
create index reservations_org_time_idx on public.resource_reservations(organization_id, starts_at);

create table public.job_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  job_type text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','completed','retry','dead_letter')),
  priority integer not null default 2 check (priority between 0 and 4),
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(organization_id, idempotency_key)
);
create index job_queue_claim_idx on public.job_queue(status, priority, available_at);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid,
  actor_role text not null,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_org_time_idx on public.audit_events(organization_id, occurred_at desc);

-- Deny by default. Reads are authorized per organization owner; writes are
-- reserved for reviewed server-side commands, not browser clients.
alter table public.organizations enable row level security;
alter table public.aircraft enable row level security;
alter table public.employees enable row level security;
alter table public.simulation_clock enable row level security;
alter table public.resource_reservations enable row level security;
alter table public.job_queue enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.organizations, public.aircraft, public.employees,
  public.simulation_clock, public.resource_reservations, public.job_queue,
  public.audit_events from anon, authenticated;

grant select on public.organizations, public.aircraft, public.employees,
  public.simulation_clock, public.resource_reservations, public.job_queue,
  public.audit_events to authenticated;

create policy organizations_owner_read on public.organizations for select
  to authenticated using (owner_user_id = (select auth.uid()));

create policy aircraft_owner_read on public.aircraft for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id = organization_id and o.owner_user_id = (select auth.uid())));

create policy employees_owner_read on public.employees for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id = organization_id and o.owner_user_id = (select auth.uid())));

create policy clock_owner_read on public.simulation_clock for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id = organization_id and o.owner_user_id = (select auth.uid())));

create policy reservations_owner_read on public.resource_reservations for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id = organization_id and o.owner_user_id = (select auth.uid())));

create policy jobs_owner_read on public.job_queue for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id = organization_id and o.owner_user_id = (select auth.uid())));

create policy audit_owner_read on public.audit_events for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id = organization_id and o.owner_user_id = (select auth.uid())));
