
-- All imported identities/privileges are unverified, retained for planning only.
alter table public.employees
 add column if not exists crew_role text check (crew_role in ('PIC','SIC','OPS_LEAD','DISPATCHER','OPS_SUPPORT')),
 add column if not exists home_base_icao text check (home_base_icao ~ '^[A-Z0-9]{4}$'),
 add column if not exists internal_dispatch_qualified boolean not null default false,
 add column if not exists source_status text check (source_status in ('legacy_active_simulated')),
 add column if not exists roster_source text not null default 'manual_entry';
alter table public.crew_qualifications
 add column if not exists cat_recorded boolean,
 add column if not exists ifr_recorded boolean,
 add column if not exists simulation_only boolean not null default false,
 add column if not exists claim_source text not null default 'user_provided';
create unique index if not exists crew_qualification_one_claim_per_type
 on public.crew_qualifications (organization_id,employee_id,qualification,aircraft_type);
create index if not exists employee_role_org_idx
 on public.employees (organization_id,crew_role,home_base_icao);
-- For display: a claim is never an operational authorization. The existing
-- 'draft' status and missing valid_until keep these records non-verified.
comment on column public.crew_qualifications.cat_recorded is
 'CAT asserted by source; NOT an independently validated flight authorization';
comment on column public.crew_qualifications.ifr_recorded is
 'IFR asserted by source; NOT an independently validated flight authorization';
comment on column public.crew_qualifications.simulation_only is
 'Muster not part of verified fleet; simulation record only';
comment on column public.employees.internal_dispatch_qualified is
 'Legacy internal dispatcher flag only; NOT a real-world aviation license';
