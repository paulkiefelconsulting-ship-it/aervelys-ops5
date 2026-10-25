-- OPS 5.0 Module foundation (new project only).
-- These are draft-only records. No money transfer, flight release, AI execution or booking integration.
-- All writes require org ownership through RLS.
alter table public.employees add constraint employees_id_org_unique unique(id,organization_id);
create schema if not exists ops_internal;
revoke all on schema ops_internal from public, anon, authenticated;

create table public.crew_qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null, qualification text not null check (char_length(qualification) between 2 and 120), aircraft_type text, valid_until date, status text not null default 'draft' check (status in ('draft','verified','expired')), foreign key (employee_id,organization_id) references public.employees(id,organization_id),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index crew_qualifications_organization_idx on public.crew_qualifications(organization_id,created_at desc);
alter table public.crew_qualifications enable row level security;
revoke all on public.crew_qualifications from anon, authenticated;
grant select,insert on public.crew_qualifications to authenticated;
create policy crew_qualifications_owner_read on public.crew_qualifications for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy crew_qualifications_owner_create on public.crew_qualifications for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  display_name text not null check (char_length(display_name) between 2 and 160), contact_email text, contact_phone text, status text not null default 'draft' check (status in ('draft','active','inactive')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index customers_organization_idx on public.customers(organization_id,created_at desc);
alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select,insert on public.customers to authenticated;
create policy customers_owner_read on public.customers for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy customers_owner_create on public.customers for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.charter_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  customer_id uuid, departure_icao text not null check (departure_icao ~ '^[A-Z0-9]{4}$'), arrival_icao text not null check (arrival_icao ~ '^[A-Z0-9]{4}$'), departure_at timestamptz not null, passengers int not null check (passengers between 1 and 40), notes text, status text not null default 'draft' check(status in ('draft','quoted','cancelled')), check (departure_icao <> arrival_icao), foreign key (customer_id,organization_id) references public.customers(id,organization_id),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index charter_requests_organization_idx on public.charter_requests(organization_id,created_at desc);
alter table public.charter_requests enable row level security;
revoke all on public.charter_requests from anon, authenticated;
grant select,insert on public.charter_requests to authenticated;
create policy charter_requests_owner_read on public.charter_requests for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy charter_requests_owner_create on public.charter_requests for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.flight_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  aircraft_id uuid, departure_icao text not null check (departure_icao ~ '^[A-Z0-9]{4}$'), arrival_icao text not null check (arrival_icao ~ '^[A-Z0-9]{4}$'), departure_at timestamptz not null, arrival_at timestamptz not null, status text not null default 'draft' check (status in ('draft','review','cancelled')), check(departure_at < arrival_at), check(departure_icao <> arrival_icao), foreign key (aircraft_id,organization_id) references public.aircraft(id,organization_id),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index flight_plans_organization_idx on public.flight_plans(organization_id,created_at desc);
alter table public.flight_plans enable row level security;
revoke all on public.flight_plans from anon, authenticated;
grant select,insert on public.flight_plans to authenticated;
create policy flight_plans_owner_read on public.flight_plans for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy flight_plans_owner_create on public.flight_plans for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.ground_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  airport_icao text not null check (airport_icao ~ '^[A-Z0-9]{4}$'), service_type text not null check (char_length(service_type) between 3 and 120), requested_for timestamptz not null, notes text, status text not null default 'draft' check(status in ('draft','requested','cancelled')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index ground_requests_organization_idx on public.ground_requests(organization_id,created_at desc);
alter table public.ground_requests enable row level security;
revoke all on public.ground_requests from anon, authenticated;
grant select,insert on public.ground_requests to authenticated;
create policy ground_requests_owner_read on public.ground_requests for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy ground_requests_owner_create on public.ground_requests for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.executive_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (char_length(title) between 3 and 160), details text, status text not null default 'draft' check(status in ('draft','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index executive_decisions_organization_idx on public.executive_decisions(organization_id,created_at desc);
alter table public.executive_decisions enable row level security;
revoke all on public.executive_decisions from anon, authenticated;
grant select,insert on public.executive_decisions to authenticated;
create policy executive_decisions_owner_read on public.executive_decisions for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy executive_decisions_owner_create on public.executive_decisions for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.finance_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  description text not null check (char_length(description) between 3 and 160), entry_kind text not null check(entry_kind in ('income','expense')), amount_eur numeric(14,2) not null check (amount_eur > 0), status text not null default 'draft' check(status in ('draft','reviewed')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index finance_drafts_organization_idx on public.finance_drafts(organization_id,created_at desc);
alter table public.finance_drafts enable row level security;
revoke all on public.finance_drafts from anon, authenticated;
grant select,insert on public.finance_drafts to authenticated;
create policy finance_drafts_owner_read on public.finance_drafts for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy finance_drafts_owner_create on public.finance_drafts for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null, starts_on date not null, ends_on date not null, reason text, status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')), check (starts_on <= ends_on), foreign key (employee_id,organization_id) references public.employees(id,organization_id),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index leave_requests_organization_idx on public.leave_requests(organization_id,created_at desc);
alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon, authenticated;
grant select,insert on public.leave_requests to authenticated;
create policy leave_requests_owner_read on public.leave_requests for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy leave_requests_owner_create on public.leave_requests for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.agent_work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (char_length(title) between 3 and 160), instruction text not null check (char_length(instruction) between 3 and 4000), status text not null default 'draft' check(status in ('draft','queued','cancelled')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index agent_work_items_organization_idx on public.agent_work_items(organization_id,created_at desc);
alter table public.agent_work_items enable row level security;
revoke all on public.agent_work_items from anon, authenticated;
grant select,insert on public.agent_work_items to authenticated;
create policy agent_work_items_owner_read on public.agent_work_items for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy agent_work_items_owner_create on public.agent_work_items for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  subject text not null check (char_length(subject) between 3 and 160), body text not null check (char_length(body) between 1 and 4000), status text not null default 'draft' check(status in ('draft','sent')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index internal_messages_organization_idx on public.internal_messages(organization_id,created_at desc);
alter table public.internal_messages enable row level security;
revoke all on public.internal_messages from anon, authenticated;
grant select,insert on public.internal_messages to authenticated;
create policy internal_messages_owner_read on public.internal_messages for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy internal_messages_owner_create on public.internal_messages for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null check (char_length(title) between 3 and 160), severity text not null default 'observation' check(severity in ('observation','low','medium','high')), description text not null check (char_length(description) between 3 and 4000), status text not null default 'draft' check(status in ('draft','under_review','closed')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index safety_reports_organization_idx on public.safety_reports(organization_id,created_at desc);
alter table public.safety_reports enable row level security;
revoke all on public.safety_reports from anon, authenticated;
grant select,insert on public.safety_reports to authenticated;
create policy safety_reports_owner_read on public.safety_reports for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy safety_reports_owner_create on public.safety_reports for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

create table public.simulation_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null check (char_length(label) between 3 and 100), account_scope text not null check(account_scope in ('business','private')), currency text not null default 'EUR' check(currency='EUR'), opening_balance_eur numeric(14,2) not null default 0 check (opening_balance_eur >= 0), status text not null default 'draft' check(status in ('draft','active')),
  created_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index simulation_accounts_organization_idx on public.simulation_accounts(organization_id,created_at desc);
alter table public.simulation_accounts enable row level security;
revoke all on public.simulation_accounts from anon, authenticated;
grant select,insert on public.simulation_accounts to authenticated;
create policy simulation_accounts_owner_read on public.simulation_accounts for select to authenticated
 using (exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy simulation_accounts_owner_create on public.simulation_accounts for insert to authenticated
 with check (
 exists(select 1 from public.organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 and status='draft'
);

-- Existing master records can be created as inactive/draft only.
grant insert on public.aircraft,public.employees to authenticated;
create policy aircraft_owner_create on public.aircraft for insert to authenticated
 with check (operational_status='inactive' and exists(select 1 from public.organizations o
 where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy employees_owner_create on public.employees for insert to authenticated
 with check (employment_status='draft' and exists(select 1 from public.organizations o
 where o.id=organization_id and o.owner_user_id=(select auth.uid())));

-- Planning options may be entered by the owner. Confirmed/operational locks
-- are not writable from the browser in this phase.
grant insert on public.resource_reservations to authenticated;
create policy reservations_owner_option on public.resource_reservations for insert to authenticated
 with check (state='option' and exists(select 1 from public.organizations o
 where o.id=organization_id and o.owner_user_id=(select auth.uid())));

-- Explicitly index composite refs. No direct update or delete API access.
create index crew_qualifications_employee_org_idx on public.crew_qualifications(employee_id,organization_id);
create index charter_requests_customer_org_idx on public.charter_requests(customer_id,organization_id);
create index flight_plans_aircraft_org_idx on public.flight_plans(aircraft_id,organization_id);
create index leave_requests_employee_org_idx on public.leave_requests(employee_id,organization_id);

-- Append-only audit. A tightly scoped, trigger-only definer writes verified
-- user id and excludes sensitive descriptions from audit payloads.
create function ops_internal.audit_creation() returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
 insert into public.audit_events(organization_id,actor_user_id,actor_role,event_type,resource_type,resource_id,details)
 values (new.organization_id,auth.uid(),'authenticated','record_created',TG_TABLE_NAME,new.id,'{}'::jsonb);
 return new;
end; $$;
revoke all on function ops_internal.audit_creation() from public,anon,authenticated;
create trigger crew_qualifications_audit_after_insert after insert on public.crew_qualifications
for each row execute function ops_internal.audit_creation();
create trigger customers_audit_after_insert after insert on public.customers
for each row execute function ops_internal.audit_creation();
create trigger charter_requests_audit_after_insert after insert on public.charter_requests
for each row execute function ops_internal.audit_creation();
create trigger flight_plans_audit_after_insert after insert on public.flight_plans
for each row execute function ops_internal.audit_creation();
create trigger ground_requests_audit_after_insert after insert on public.ground_requests
for each row execute function ops_internal.audit_creation();
create trigger executive_decisions_audit_after_insert after insert on public.executive_decisions
for each row execute function ops_internal.audit_creation();
create trigger finance_drafts_audit_after_insert after insert on public.finance_drafts
for each row execute function ops_internal.audit_creation();
create trigger leave_requests_audit_after_insert after insert on public.leave_requests
for each row execute function ops_internal.audit_creation();
create trigger agent_work_items_audit_after_insert after insert on public.agent_work_items
for each row execute function ops_internal.audit_creation();
create trigger internal_messages_audit_after_insert after insert on public.internal_messages
for each row execute function ops_internal.audit_creation();
create trigger safety_reports_audit_after_insert after insert on public.safety_reports
for each row execute function ops_internal.audit_creation();
create trigger simulation_accounts_audit_after_insert after insert on public.simulation_accounts
for each row execute function ops_internal.audit_creation();
create trigger aircraft_audit_after_insert after insert on public.aircraft
for each row execute function ops_internal.audit_creation();
create trigger employees_audit_after_insert after insert on public.employees
for each row execute function ops_internal.audit_creation();
create trigger resource_reservations_audit_after_insert after insert on public.resource_reservations
for each row execute function ops_internal.audit_creation();

-- Initialize a stopped simulation clock for the new organization only.
insert into public.simulation_clock(organization_id,sim_now,mode)
select id,now(),'stopped' from public.organizations
on conflict(organization_id) do nothing;
