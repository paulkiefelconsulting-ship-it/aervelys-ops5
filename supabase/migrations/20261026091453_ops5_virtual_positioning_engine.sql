-- Virtual aircraft repositioning worker; attached to existing hourly shadow lifecycle.
-- All routes, costs and flight times are fictional assumptions.
create or replace function ops_internal.advance_shadow_positioning(p_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare
 flight record;
 aircraft_state record;
 leg record;
 duration_hours numeric;
 planned_departure timestamptz;
 planned_arrival timestamptz;
 leg_id uuid;
 new_status text;
 n_planned int:=0;
 n_departed int:=0;
 n_arrived int:=0;
 n_blocked int:=0;
begin
 if p_at is null then raise exception 'Simulation instant required';end if;
 perform pg_advisory_xact_lock(505,9105);

 -- Consider only the next outstanding charter scenario for each aircraft.
 for flight in
  select distinct on (f.aircraft_id)
   f.id,f.organization_id,f.aircraft_id,f.departure_icao,f.departure_at
  from public.shadow_flights f
  where f.status='planned' and f.departure_at between p_at and p_at+interval '14 days'
  order by f.aircraft_id,f.departure_at,f.id
 loop
  select * into aircraft_state from public.shadow_aircraft_states
   where aircraft_id=flight.aircraft_id for update;
  if not found or aircraft_state.phase<>'parked'
    or aircraft_state.hypothetical_location_icao=flight.departure_icao then continue;end if;

  if exists(select 1 from public.shadow_positioning_legs prev
   where prev.organization_id=flight.organization_id and prev.shadow_flight_id=flight.id) then
   continue;
  end if;
  if exists(select 1 from public.shadow_positioning_legs prev
   where prev.aircraft_id=flight.aircraft_id and prev.status in ('planned','enroute')) then
   continue;
  end if;

  -- Reversed duration: symmetric fictional scenario, NOT flight performance data.
  select coalesce(
   (select r.assumed_block_hours from ops_internal.simulated_route_assumptions r
    where r.departure_icao=aircraft_state.hypothetical_location_icao
      and r.arrival_icao=flight.departure_icao),
   (select r.assumed_block_hours from ops_internal.simulated_route_assumptions r
    where r.departure_icao=flight.departure_icao
      and r.arrival_icao=aircraft_state.hypothetical_location_icao)
  ) into duration_hours;
  planned_arrival:=flight.departure_at-interval '2 hours';
  planned_departure:=case when duration_hours is null then null else
    planned_arrival-(duration_hours::double precision*interval '1 hour') end;

  if duration_hours is null then new_status:='blocked_route';
  elsif planned_departure<p_at+interval '1 hour' then new_status:='blocked_time';
  elsif exists(
   select 1 from public.shadow_flights other
    where other.aircraft_id=flight.aircraft_id and other.id<>flight.id
      and other.status in ('planned','in_air')
      and tstzrange(other.departure_at,other.arrival_at,'[)') &&
        tstzrange(planned_departure,planned_arrival,'[)')
  ) then new_status:='blocked_busy';
  else new_status:='planned';end if;

  insert into public.shadow_positioning_legs(
   organization_id,shadow_flight_id,aircraft_id,from_icao,to_icao,
   proposed_departure_at,proposed_arrival_at,assumed_block_hours,
   fictional_cost_eur,status,reason
  ) values (
   flight.organization_id,flight.id,flight.aircraft_id,
   aircraft_state.hypothetical_location_icao,flight.departure_icao,
   planned_departure,case when duration_hours is null then null else planned_arrival end,
   duration_hours,case when duration_hours is null then null else round(650+duration_hours*1700,2) end,
   new_status,case new_status
     when 'planned' then 'Fictional ferry leg; two-hour virtual turnaround buffer.'
     when 'blocked_route' then 'No fictional route-duration assumption exists.'
     when 'blocked_time' then 'Insufficient time for virtual positioning and turnaround.'
     else 'Conflicting shadow-flight window.' end
  ) returning id into leg_id;
  insert into public.shadow_positioning_events(
   organization_id,leg_id,event_type,event_at,narrative
  )values(flight.organization_id,leg_id,new_status,p_at,
   'Hypothetical positioning assessment: '||new_status);
  if new_status='planned' then n_planned:=n_planned+1;
  else n_blocked:=n_blocked+1;end if;
 end loop;

 -- Advance fictitious ferry phases and virtual hours without touching operational data.
 for leg in
  select * from public.shadow_positioning_legs
   where status in ('planned','enroute') and proposed_departure_at<=p_at
   order by proposed_departure_at,id for update
 loop
  select * into aircraft_state from public.shadow_aircraft_states
    where aircraft_id=leg.aircraft_id for update;
  if leg.status='planned' then
   if not found or aircraft_state.phase<>'parked'
     or aircraft_state.hypothetical_location_icao<>leg.from_icao then
    update public.shadow_positioning_legs set status='blocked_busy',
      reason='Aircraft shadow location or phase changed before ferry.',updated_at=p_at
      where id=leg.id;
    insert into public.shadow_positioning_events(
      organization_id,leg_id,event_type,event_at,narrative)
     values(leg.organization_id,leg.id,'blocked_busy',p_at,
       'Ferry cancelled: virtual aircraft no longer at departure location.');
    n_blocked:=n_blocked+1;
    continue;
   end if;
   update public.shadow_positioning_legs set status='enroute',
     departed_at=leg.proposed_departure_at,updated_at=p_at where id=leg.id;
   update public.shadow_aircraft_states set phase='positioning',
     active_positioning_id=leg.id,updated_at=leg.proposed_departure_at
    where aircraft_id=leg.aircraft_id;
   insert into public.shadow_positioning_events(
     organization_id,leg_id,event_type,event_at,narrative)
    values(leg.organization_id,leg.id,'departed',leg.proposed_departure_at,
      'Counterfactual ferry start; no real pilot, flight or aircraft movement.');
   n_departed:=n_departed+1;
  end if;
  if leg.proposed_arrival_at<=p_at then
   select * into aircraft_state from public.shadow_aircraft_states
     where aircraft_id=leg.aircraft_id for update;
   if aircraft_state.phase<>'positioning'
     or aircraft_state.active_positioning_id is distinct from leg.id then
    raise exception 'Virtual ferry state inconsistent';
   end if;
   update public.shadow_aircraft_states set phase='parked',
     active_positioning_id=null,
     hypothetical_location_icao=leg.to_icao,
     accumulated_hypothetical_hours=accumulated_hypothetical_hours+leg.assumed_block_hours,
     updated_at=leg.proposed_arrival_at where aircraft_id=leg.aircraft_id;
   update public.shadow_positioning_legs set status='completed',
     arrived_at=leg.proposed_arrival_at,updated_at=p_at where id=leg.id;
   insert into public.shadow_positioning_events(
     organization_id,leg_id,event_type,event_at,narrative)
    values(leg.organization_id,leg.id,'arrived',leg.proposed_arrival_at,
      'Counterfactual landing; shadow aircraft location and hours changed.');
   insert into public.audit_events(
     organization_id,actor_role,event_type,resource_type,resource_id,details)
    values(leg.organization_id,'simulation_worker','shadow_positioning_completed',
     'shadow_positioning_legs',leg.id,
     jsonb_build_object('fictional',true,'hours',leg.assumed_block_hours,
       'cash_movement',false));
   n_arrived:=n_arrived+1;
  end if;
 end loop;
 return jsonb_build_object('planned',n_planned,'departed',n_departed,
  'arrived',n_arrived,'blocked',n_blocked,'simulation_only',true);
end $fn$;
revoke all on function ops_internal.advance_shadow_positioning(timestamptz)
 from public,anon,authenticated;

-- Integrate with the existing hourly job's engine, after demand->flight creation,
-- before normal virtual departures.
do $patch$
declare s text;
begin
 select pg_get_functiondef('ops_internal.advance_shadow_flights(timestamptz)'::regprocedure) into s;
 if position('-- Advance in chronological departure order. A missed tick may catch up' in s)=0
    or position('if st.phase=''in_air'' then' in s)=0 then
   raise exception 'Flight worker version has changed; integration cancelled';
 end if;
 s:=replace(s,
   '-- Advance in chronological departure order. A missed tick may catch up',
   'perform ops_internal.advance_shadow_positioning(p_at);' || chr(10) ||
   '  -- Advance in chronological departure order. A missed tick may catch up');
 s:=replace(s, 'if st.phase=''in_air'' then', 'if st.phase<>''parked'' then');
 execute s;
end $patch$;
revoke all on function ops_internal.advance_shadow_flights(timestamptz)
 from public,anon,authenticated;
