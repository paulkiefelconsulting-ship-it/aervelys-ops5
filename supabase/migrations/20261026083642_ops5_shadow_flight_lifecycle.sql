-- OPS 5.0 autonomous shadow-flight lifecycle.
-- Counterfactual simulation ONLY. Never use for aircraft/crew operational release,
-- real customer communication, bank movements or confirmed flight hours.

create table public.shadow_flights(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 charter_request_id uuid not null,
 aircraft_id uuid not null,
 registration_snapshot text not null,
 departure_icao text not null check(departure_icao ~ '^[A-Z0-9]{4}$'),
 arrival_icao text not null check(arrival_icao ~ '^[A-Z0-9]{4}$'),
 departure_at timestamptz not null,
 arrival_at timestamptz not null,
 assumed_block_hours numeric(5,2) not null check(assumed_block_hours>0),
 passengers integer not null check(passengers between 1 and 40),
 model_revenue_eur numeric(14,2),
 model_cost_eur numeric(14,2),
 status text not null default 'planned' check(status in
  ('planned','in_air','completed','blocked_positioning','blocked_busy')),
 simulation_only boolean not null default true check(simulation_only),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(departure_at<arrival_at),
 unique(organization_id,charter_request_id),
 unique(id,organization_id),
 foreign key(charter_request_id,organization_id) references public.charter_requests(id,organization_id),
 foreign key(aircraft_id,organization_id) references public.aircraft(id,organization_id)
);
create index shadow_flights_due_idx on public.shadow_flights(status,departure_at);
create index shadow_flights_org_recent_idx on public.shadow_flights(organization_id,departure_at desc);

create table public.shadow_aircraft_states(
 aircraft_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 registration_snapshot text not null,
 hypothetical_location_icao text not null check(hypothetical_location_icao ~ '^[A-Z0-9]{4}$'),
 accumulated_hypothetical_hours numeric(12,2) not null default 0 check(accumulated_hypothetical_hours>=0),
 phase text not null default 'parked' check(phase in ('parked','in_air')),
 active_shadow_flight_id uuid,
 updated_at timestamptz not null default now(),
 unique(aircraft_id,organization_id),
 foreign key(aircraft_id,organization_id) references public.aircraft(id,organization_id),
 foreign key(active_shadow_flight_id,organization_id) references public.shadow_flights(id,organization_id),
 check((phase='in_air')=(active_shadow_flight_id is not null))
);

create table public.shadow_flight_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 shadow_flight_id uuid not null,
 event_type text not null check(event_type in ('created','departed','arrived','blocked_positioning','blocked_busy')),
 event_at timestamptz not null,
 narrative text not null,
 simulation_only boolean not null default true check(simulation_only),
 recorded_at timestamptz not null default now(),
 unique(shadow_flight_id,event_type),
 foreign key(shadow_flight_id,organization_id) references public.shadow_flights(id,organization_id)
);

create table public.shadow_flight_outcomes(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 shadow_flight_id uuid not null,
 completed_at timestamptz not null,
 hypothetical_block_hours numeric(5,2) not null check(hypothetical_block_hours>0),
 model_revenue_eur numeric(14,2),
 model_cost_eur numeric(14,2),
 model_margin_eur numeric(14,2) generated always as
  (model_revenue_eur-model_cost_eur) stored,
 simulation_only boolean not null default true check(simulation_only),
 note text not null default 'Counterfactual flight result; NOT realized revenue or booked cash.',
 unique(shadow_flight_id),
 foreign key(shadow_flight_id,organization_id) references public.shadow_flights(id,organization_id),
 check((model_revenue_eur is null and model_cost_eur is null) or
       (model_revenue_eur is not null and model_cost_eur is not null))
);

do $access$
declare t text;
begin
 foreach t in array array['shadow_flights','shadow_aircraft_states','shadow_flight_events','shadow_flight_outcomes']
 loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format(
   'create policy %I on public.%I for select to authenticated
    using(exists(select 1 from public.organizations o where o.id=organization_id
      and o.owner_user_id=(select auth.uid())))',t||'_owner_read',t);
 end loop;
end $access$;

-- Events and economic what-if outcomes are append-only.
create trigger shadow_flight_events_immutable before update or delete on public.shadow_flight_events
 for each row execute function ops_internal.prevent_sim_ledger_mutation();
create trigger shadow_flight_outcomes_immutable before update or delete on public.shadow_flight_outcomes
 for each row execute function ops_internal.prevent_sim_ledger_mutation();

create or replace function ops_internal.advance_shadow_flights(
 p_at timestamptz default now()
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog as $flight$
declare
 r record; a record; f record; st record; v_status text;
 v_created integer:=0;v_departed integer:=0;v_arrived integer:=0;v_blocked integer:=0;
begin
 if p_at is null then raise exception 'time required'; end if;
 -- Process one world-clock advance at a time to keep virtual positions coherent.
 perform pg_advisory_xact_lock(505, 9105);

 -- Every fleet entry receives an isolated hypothetical state. Operational
 -- aircraft.current_icao is not read as confirmed nor ever updated.
 insert into public.shadow_aircraft_states
  (aircraft_id,organization_id,registration_snapshot,hypothetical_location_icao)
 select a.id,a.organization_id,a.registration,a.home_base_icao
 from public.aircraft a
 on conflict(aircraft_id) do nothing;

 -- Only explicitly synthetic demand with a mapped scenario duration enters
 -- this counterfactual engine. No manual request or actual flight plan.
 for r in
  select cr.id,cr.organization_id,cr.departure_icao,cr.arrival_icao,
    cr.departure_at,cr.passengers,
    ca.candidate_aircraft_id,ca.assumed_block_hours,
    ca.illustrative_revenue_eur,ca.illustrative_cost_eur
  from public.charter_requests cr
  join public.charter_assessments ca
   on ca.request_id=cr.id and ca.organization_id=cr.organization_id
  where cr.origin='simulation' and cr.status='draft'
    and cr.departure_at >= p_at-interval '30 days'
    and ca.candidate_aircraft_id is not null
    and ca.assumed_block_hours is not null
    and not exists(select 1 from public.shadow_flights sf
      where sf.organization_id=cr.organization_id
       and sf.charter_request_id=cr.id)
  order by cr.departure_at,cr.id
  limit 200
 loop
  select * into a from public.aircraft where id=r.candidate_aircraft_id
   and organization_id=r.organization_id;
  if not found then continue; end if;
  insert into public.shadow_flights(
    organization_id,charter_request_id,aircraft_id,registration_snapshot,
    departure_icao,arrival_icao,departure_at,arrival_at,assumed_block_hours,
    passengers,model_revenue_eur,model_cost_eur
  )values(
    r.organization_id,r.id,a.id,a.registration,r.departure_icao,r.arrival_icao,
    r.departure_at,r.departure_at+(r.assumed_block_hours::double precision*interval '1 hour'),
    r.assumed_block_hours,r.passengers,r.illustrative_revenue_eur,r.illustrative_cost_eur
  ) on conflict(organization_id,charter_request_id) do nothing returning id into f;
  if f.id is not null then
   insert into public.shadow_flight_events(organization_id,shadow_flight_id,event_type,event_at,narrative)
    values(r.organization_id,f.id,'created',p_at,'Hypothetical scenario created, without crew assignment or operational release.');
   v_created:=v_created+1;
  end if;
  f:=null;
 end loop;

 -- Advance in chronological departure order. A missed tick may catch up
 -- several phases, but never teleport a hypothetical aircraft.
 for f in
  select * from public.shadow_flights
  where status in ('planned','in_air') and departure_at<=p_at
  order by departure_at,id
  for update
 loop
  select * into st from public.shadow_aircraft_states where aircraft_id=f.aircraft_id
   and organization_id=f.organization_id for update;
  if not found then raise exception 'hypothetical aircraft state missing';end if;

  if f.status='planned' then
   if st.phase='in_air' then
    v_status:='blocked_busy';
   elsif st.hypothetical_location_icao<>f.departure_icao then
    v_status:='blocked_positioning';
   else
    v_status:='in_air';
   end if;

   update public.shadow_flights
    set status=v_status,updated_at=p_at where id=f.id;
   if v_status<>'in_air' then
    insert into public.shadow_flight_events(
      organization_id,shadow_flight_id,event_type,event_at,narrative
    )values(f.organization_id,f.id,v_status,p_at,
      case when v_status='blocked_positioning' then
       'Scenario not flown: virtual aircraft is at another airport; repositioning is not simulated yet.'
      else 'Scenario not flown: virtual aircraft already occupies another scenario.' end);
    v_blocked:=v_blocked+1;
    continue;
   end if;

   update public.shadow_aircraft_states
    set phase='in_air',active_shadow_flight_id=f.id,updated_at=f.departure_at
    where aircraft_id=f.aircraft_id;
   insert into public.shadow_flight_events(organization_id,shadow_flight_id,event_type,event_at,narrative)
    values(f.organization_id,f.id,'departed',f.departure_at,
      'Counterfactual takeoff; no real aircraft movement, crew dispatch or flight release.');
   v_departed:=v_departed+1;
  end if;

  -- A flight can only land if this scenario still owns the virtual aircraft.
  if f.arrival_at<=p_at then
   select * into st from public.shadow_aircraft_states
    where aircraft_id=f.aircraft_id for update;
   if st.phase<>'in_air' or st.active_shadow_flight_id is distinct from f.id then
    raise exception 'virtual aircraft state mismatch';
   end if;
   update public.shadow_flights set status='completed',updated_at=p_at where id=f.id;
   update public.shadow_aircraft_states
    set hypothetical_location_icao=f.arrival_icao,
        accumulated_hypothetical_hours=accumulated_hypothetical_hours+f.assumed_block_hours,
        phase='parked',active_shadow_flight_id=null,updated_at=f.arrival_at
    where aircraft_id=f.aircraft_id;
   insert into public.shadow_flight_events(organization_id,shadow_flight_id,event_type,event_at,narrative)
    values(f.organization_id,f.id,'arrived',f.arrival_at,
      'Counterfactual landing; model flight hours and location updated in shadow tables only.');
   insert into public.shadow_flight_outcomes(
    organization_id,shadow_flight_id,completed_at,hypothetical_block_hours,
    model_revenue_eur,model_cost_eur
   ) values(
    f.organization_id,f.id,f.arrival_at,f.assumed_block_hours,
    f.model_revenue_eur,f.model_cost_eur
   ) on conflict(shadow_flight_id) do nothing;
   insert into public.audit_events(
    organization_id,actor_role,event_type,resource_type,resource_id,details)
   values(f.organization_id,'simulation_worker','shadow_flight_completed','shadow_flights',f.id,
    jsonb_build_object('hypothetical',true,'block_hours',f.assumed_block_hours,
      'origin',f.departure_icao,'destination',f.arrival_icao,'cash_movement',false));
   v_arrived:=v_arrived+1;
  end if;
 end loop;

 return jsonb_build_object('created',v_created,'departed',v_departed,
   'completed',v_arrived,'blocked',v_blocked,'shadow_only',true);
end $flight$;
revoke all on function ops_internal.advance_shadow_flights(timestamptz)
 from public,anon,authenticated;
comment on function ops_internal.advance_shadow_flights(timestamptz) is
 'Database-only hourly counterfactual lifecycle. Never updates operational tables or accounts.';

select cron.schedule(
 'aervelys-ops5-shadow-flight-hourly','0 * * * *',
 'select ops_internal.advance_shadow_flights(now());'
);
