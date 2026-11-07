-- AERVELYS OPS 5.0: CREW in the counterfactual shadow universe only.
-- These assignments NEVER authorize actual flights, qualifications, duty/rest,
-- commercial releases, real MSFS telemetry, or operational crew_location_events.
-- No retroactive assignment or synthetic crew teleporting.

create table public.shadow_crew_assignments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 shadow_flight_id uuid not null,
 employee_id uuid not null,
 crew_role text not null check (crew_role in ('PIC','SIC')),
 assigned_at timestamptz not null default now(),
 assigned_by_user_id uuid not null references auth.users(id),
 simulation_only boolean not null default true check (simulation_only),
 unique (id,organization_id),
 unique (organization_id,shadow_flight_id,crew_role),
 unique (organization_id,shadow_flight_id,employee_id),
 foreign key (shadow_flight_id,organization_id)
  references public.shadow_flights(id,organization_id),
 foreign key (employee_id,organization_id)
  references public.employees(id,organization_id)
);
create index shadow_crew_assignments_person_idx on public.shadow_crew_assignments
 (organization_id,employee_id,assigned_at desc);

create table public.shadow_crew_movements (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 assignment_id uuid not null,
 employee_id uuid not null,
 source_kind text not null check(source_kind in ('charter','ferry')),
 source_id uuid not null,
 from_icao text not null check(from_icao ~ '^[A-Z0-9]{4}$'),
 to_icao text not null check(to_icao ~ '^[A-Z0-9]{4}$'),
 departed_at timestamptz not null,
 arrived_at timestamptz not null,
 status text not null check(status in (
  'completed_virtual','blocked_no_location','blocked_wrong_airport',
  'blocked_stale_location','blocked_early_assignment','blocked_time_window'
 )),
 reason text not null,
 simulation_only boolean not null default true check(simulation_only),
 recorded_at timestamptz not null default now(),
 check(departed_at < arrived_at),
 unique(organization_id,source_kind,source_id,employee_id),
 foreign key(assignment_id,organization_id) references public.shadow_crew_assignments(id,organization_id),
 foreign key(employee_id,organization_id) references public.employees(id,organization_id)
);
create index shadow_crew_movements_person_idx on public.shadow_crew_movements
 (organization_id,employee_id,arrived_at desc);

alter table public.shadow_crew_assignments enable row level security;
alter table public.shadow_crew_movements enable row level security;
revoke all on public.shadow_crew_assignments, public.shadow_crew_movements
 from public, anon, authenticated;
grant select,insert on public.shadow_crew_assignments to authenticated;
grant select on public.shadow_crew_movements to authenticated;

create policy shadow_crew_assignments_owner_read
 on public.shadow_crew_assignments for select to authenticated
 using (exists(select 1 from public.organizations o
  where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy shadow_crew_assignments_owner_create
 on public.shadow_crew_assignments for insert to authenticated with check (
  assigned_by_user_id=(select auth.uid())
  and simulation_only=true
  and assigned_at between now()-interval '5 minutes' and now()+interval '1 minute'
  and exists(select 1 from public.organizations o
   where o.id=organization_id and o.owner_user_id=(select auth.uid()))
  and exists(select 1 from public.employees e
   where e.id=employee_id and e.organization_id=organization_id and e.crew_role=crew_role)
  and exists(select 1 from public.shadow_flights f
   where f.id=shadow_flight_id and f.organization_id=organization_id
    and f.status='planned' and f.departure_at>now()+interval '10 minutes')
 );
create policy shadow_crew_movements_owner_read
 on public.shadow_crew_movements for select to authenticated
 using (exists(select 1 from public.organizations o
  where o.id=organization_id and o.owner_user_id=(select auth.uid())));

-- Serialize crew assignments per employee and prevent overlapping charter scenarios.
create function ops_internal.validate_shadow_crew_assignment()
returns trigger language plpgsql security definer set search_path=pg_catalog as $body$
declare v_flight record;
begin
 if (select auth.uid()) is distinct from new.assigned_by_user_id
  or not exists (select 1 from public.organizations o
    where o.id=new.organization_id and o.owner_user_id=(select auth.uid())) then
  raise exception 'unauthorized shadow crew assignment';
 end if;
 if new.assigned_at not between now()-interval '5 minutes' and now()+interval '1 minute' then
  raise exception 'assignment timestamp not acceptable';
 end if;
 select * into v_flight from public.shadow_flights f
  where f.id=new.shadow_flight_id and f.organization_id=new.organization_id;
 if not found or v_flight.status<>'planned' or not v_flight.simulation_only
  or v_flight.departure_at<=now()+interval '10 minutes' then
  raise exception 'only upcoming planned synthetic flights can be assigned';
 end if;
 -- Lock the same employee row for concurrent insert attempts.
 perform 1 from public.employees e
  where e.id=new.employee_id and e.organization_id=new.organization_id
   and e.crew_role=new.crew_role for update;
 if not found then raise exception 'crew role mismatch'; end if;
 if exists(
  select 1 from public.shadow_crew_assignments prev
  join public.shadow_flights other on other.id=prev.shadow_flight_id
   and other.organization_id=prev.organization_id
  where prev.employee_id=new.employee_id and prev.organization_id=new.organization_id
   and tstzrange(other.departure_at - interval '45 minutes',
    other.arrival_at + interval '45 minutes','[)') &&
       tstzrange(v_flight.departure_at - interval '45 minutes',
    v_flight.arrival_at + interval '45 minutes','[)')
 ) then
  raise exception 'crew already assigned to overlapping synthetic flight';
 end if;
 return new;
end $body$;
revoke all on function ops_internal.validate_shadow_crew_assignment()
 from public, anon, authenticated;
create trigger shadow_crew_assignment_validate
 before insert on public.shadow_crew_assignments for each row
 execute function ops_internal.validate_shadow_crew_assignment();

create trigger shadow_crew_assignments_immutable before update or delete
 on public.shadow_crew_assignments for each row
 execute function ops_internal.prevent_sim_ledger_mutation();
create trigger shadow_crew_movements_immutable before update or delete
 on public.shadow_crew_movements for each row
 execute function ops_internal.prevent_sim_ledger_mutation();

-- The world-clock worker emits movements ONLY for previously staffed synthetic
-- missions that it has actually completed. Failed physical/logical continuity
-- creates a separate blocked audit outcome without changing location.
create function ops_internal.record_shadow_crew_arrival()
returns trigger language plpgsql security definer set search_path=pg_catalog as $body$
declare
 v_flight record;
 v_assignment record;
 v_kind text;
 v_source uuid;
 v_from text;
 v_to text;
 v_depart timestamptz;
 v_arrive timestamptz;
 v_previous text;
 v_previous_at timestamptz;
 v_status text;
 v_reason text;
begin
 if tg_table_name='shadow_flight_outcomes' then
  if tg_op<>'INSERT' or not new.simulation_only then return new; end if;
  select * into v_flight from public.shadow_flights f
   where f.id=new.shadow_flight_id and f.organization_id=new.organization_id;
  if not found or v_flight.status<>'completed' or not v_flight.simulation_only then
   return new;
  end if;
  v_kind:='charter';
  v_source:=new.shadow_flight_id;
  v_from:=v_flight.departure_icao;
  v_to:=v_flight.arrival_icao;
  v_depart:=v_flight.departure_at;
  v_arrive:=new.completed_at;
 elsif tg_table_name='shadow_positioning_legs' then
  if tg_op<>'UPDATE' or new.status<>'completed'
   or old.status='completed' or not new.simulation_only
   or new.departed_at is null or new.arrived_at is null then
   return new;
  end if;
  v_kind:='ferry';
  v_source:=new.id;
  v_from:=new.from_icao;
  v_to:=new.to_icao;
  v_depart:=new.departed_at;
  v_arrive:=new.arrived_at;
  select * into v_flight from public.shadow_flights f
   where f.id=new.shadow_flight_id and f.organization_id=new.organization_id;
 else
  return new;
 end if;
 if v_depart is null or v_arrive is null or v_arrive<=v_depart then return new; end if;
 for v_assignment in
  select a.* from public.shadow_crew_assignments a
  where a.shadow_flight_id=v_flight.id
   and a.organization_id=new.organization_id
  order by a.employee_id
 loop
  v_previous:=null;v_previous_at:=null;
  v_status:='completed_virtual';
  v_reason:='Simulation only; evidence from shadow mission completion.';
  -- No staffing added after a mission has already taken off.
  if v_assignment.assigned_at>v_depart then
   v_status:='blocked_early_assignment';
   v_reason:='Synthetic crew was assigned after mission departure.';
  else
   -- Prefer the latest successfully completed shadow crew movement.
   select m.to_icao,m.arrived_at into v_previous,v_previous_at
    from public.shadow_crew_movements m
    where m.organization_id=new.organization_id
     and m.employee_id=v_assignment.employee_id
     and m.status='completed_virtual' and m.arrived_at<=v_depart
    order by m.arrived_at desc,m.id desc limit 1;
   if v_previous is null then
    -- Initial anchor must be an explicitly owner-verified virtual check-in.
    select e.location_icao,e.occurred_at into v_previous,v_previous_at
     from public.crew_location_events e
     where e.organization_id=new.organization_id
      and e.employee_id=v_assignment.employee_id
      and e.event_type='check_in'
      and e.verification_state='verified'
      and e.source_reference='owner_manual_initial_checkin'
      and e.occurred_at<=v_depart
     order by e.occurred_at desc,e.id desc limit 1;
   end if;
   if v_previous is null then
    v_status:='blocked_no_location';
    v_reason:='No evidenced initial crew location or preceding synthetic movement.';
   elsif v_previous<>v_from then
    v_status:='blocked_wrong_airport';
    v_reason:='Crew is not at synthetic flight departure airport; positioning required.';
   elsif v_previous_at<v_depart-interval '7 days' then
    v_status:='blocked_stale_location';
    v_reason:='Previous position was observed more than seven days earlier.';
   elsif v_previous_at>v_depart-interval '30 minutes' then
    v_status:='blocked_time_window';
    v_reason:='Crew transfer or prior flight does not leave 30 minutes at departure airport.';
   end if;
  end if;
  insert into public.shadow_crew_movements(
   organization_id,assignment_id,employee_id,source_kind,source_id,
   from_icao,to_icao,departed_at,arrived_at,status,reason
  )values(
   new.organization_id,v_assignment.id,v_assignment.employee_id,v_kind,v_source,
   v_from,v_to,v_depart,v_arrive,v_status,v_reason
  )on conflict (organization_id,source_kind,source_id,employee_id) do nothing;
 end loop;
 return new;
end $body$;
revoke all on function ops_internal.record_shadow_crew_arrival()
 from public, anon, authenticated;

create trigger shadow_crew_charter_completed
 after insert on public.shadow_flight_outcomes for each row
 execute function ops_internal.record_shadow_crew_arrival();
create trigger shadow_crew_ferry_completed
 after update of status on public.shadow_positioning_legs for each row
 execute function ops_internal.record_shadow_crew_arrival();

comment on table public.shadow_crew_assignments is
 'Virtual-only human-selected PIC/SIC staffing of counterfactual flights; no real flight or crew authorization.';
comment on table public.shadow_crew_movements is
 'Append-only hypothetical crew arrivals or blocked continuity checks from completed counterfactual charter/ferry legs. NEVER real crew positions.';
