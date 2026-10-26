create table if not exists ops_private.simulation_authorization_evidence(
 legacy_id uuid primary key,
 employee_id uuid not null references public.employees(id) on delete restrict,
 aircraft_model text not null,
 role text not null,
 source_status text,
 sim_ifr_recorded boolean,
 sim_charter_recorded boolean,
 sim_night_recorded boolean,
 review_due date,
 verified_for_operations boolean not null default false,
 imported_at timestamptz not null default now()
);
create table if not exists ops_private.simulation_license_evidence(
 legacy_id uuid primary key,
 employee_id uuid not null references public.employees(id) on delete restrict,
 licence_title text not null,
 issued_on date,
 internal_review_due date,
 source_status text,
 verified_for_operations boolean not null default false,
 imported_at timestamptz not null default now()
);
alter table ops_private.simulation_authorization_evidence enable row level security;
alter table ops_private.simulation_license_evidence enable row level security;
revoke all on ops_private.simulation_authorization_evidence,ops_private.simulation_license_evidence from public,anon,authenticated;