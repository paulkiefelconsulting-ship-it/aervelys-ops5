-- Isolated counterfactual aircraft positioning. No real operations or accounting.
create table public.shadow_positioning_legs(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 shadow_flight_id uuid not null,
 aircraft_id uuid not null,
 from_icao text not null check(from_icao ~ '^[A-Z0-9]{4}$'),
 to_icao text not null check(to_icao ~ '^[A-Z0-9]{4}$'),
 proposed_departure_at timestamptz,
 proposed_arrival_at timestamptz,
 departed_at timestamptz,
 arrived_at timestamptz,
 assumed_block_hours numeric(5,2),
 fictional_cost_eur numeric(14,2),
 status text not null check(status in ('planned','enroute','completed','blocked_route','blocked_time','blocked_busy')),
 reason text not null,
 simulation_only boolean not null default true check(simulation_only),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(from_icao<>to_icao),
 check((status in ('planned','enroute','completed') and assumed_block_hours>0
  and proposed_departure_at is not null and proposed_arrival_at is not null
  and proposed_departure_at<proposed_arrival_at)
  or status in ('blocked_route','blocked_time','blocked_busy')),
 unique(organization_id,shadow_flight_id),
 unique(id,organization_id),
 foreign key(shadow_flight_id,organization_id) references public.shadow_flights(id,organization_id),
 foreign key(aircraft_id,organization_id) references public.aircraft(id,organization_id)
);
create unique index shadow_positioning_active_aircraft_idx on public.shadow_positioning_legs(aircraft_id)
 where status in ('planned','enroute');
create index shadow_positioning_org_idx on public.shadow_positioning_legs(organization_id,created_at desc);

create table public.shadow_positioning_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 leg_id uuid not null,
 event_type text not null check(event_type in ('planned','departed','arrived','blocked_route','blocked_time','blocked_busy')),
 event_at timestamptz not null,
 narrative text not null,
 simulation_only boolean not null default true check(simulation_only),
 unique(leg_id,event_type),
 foreign key(leg_id,organization_id) references public.shadow_positioning_legs(id,organization_id)
);
alter table public.shadow_aircraft_states add column active_positioning_id uuid;
alter table public.shadow_aircraft_states add constraint shadow_positioning_active_fk
 foreign key(active_positioning_id,organization_id)
 references public.shadow_positioning_legs(id,organization_id);
alter table public.shadow_aircraft_states drop constraint shadow_aircraft_states_check;
alter table public.shadow_aircraft_states drop constraint shadow_aircraft_states_phase_check;
alter table public.shadow_aircraft_states add constraint shadow_aircraft_states_phase_check
 check(phase in ('parked','in_air','positioning'));
alter table public.shadow_aircraft_states add constraint shadow_states_exclusive_active
 check(
  (phase='parked' and active_shadow_flight_id is null and active_positioning_id is null)
  or (phase='in_air' and active_shadow_flight_id is not null and active_positioning_id is null)
  or (phase='positioning' and active_shadow_flight_id is null and active_positioning_id is not null)
 );

do $access$
declare t text;
begin
 foreach t in array array['shadow_positioning_legs','shadow_positioning_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using
    (exists(select 1 from public.organizations o
      where o.id=organization_id and o.owner_user_id=(select auth.uid())))',
   t||'_owner_read',t);
 end loop;
end $access$;

create trigger shadow_positioning_events_no_mutation before update or delete
 on public.shadow_positioning_events for each row
 execute function ops_internal.prevent_sim_ledger_mutation();
