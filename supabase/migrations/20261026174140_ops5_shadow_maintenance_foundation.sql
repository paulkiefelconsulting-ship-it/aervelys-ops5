-- OPS5 fictional maintenance cycle; not real airworthiness / maintenance releases.
create table ops_internal.shadow_maintenance_models (
 aircraft_type text primary key,
 assumed_service_interval_hours numeric(8,2) not null check(assumed_service_interval_hours>0),
 assumed_service_duration_hours numeric(6,2) not null check(assumed_service_duration_hours>0),
 note text not null default 'Invented simulator parameter. Not an approved maintenance schedule.'
);
revoke all on ops_internal.shadow_maintenance_models from public,anon,authenticated;
insert into ops_internal.shadow_maintenance_models(aircraft_type,assumed_service_interval_hours,assumed_service_duration_hours)
values('Citation Longitude',20,12),('Citation CJ4',20,12),('Phenom 300E',20,12),
 ('PC-24',20,12),('Vision Jet G2',20,12);

create table public.shadow_maintenance_states(
 aircraft_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 registration_snapshot text not null,
 aircraft_type_snapshot text not null,
 interval_hours numeric(8,2) not null check(interval_hours>0),
 service_duration_hours numeric(6,2) not null check(service_duration_hours>0),
 last_service_at_hours numeric(12,2) not null default 0 check(last_service_at_hours>=0),
 due_at_hours numeric(12,2) not null check(due_at_hours>last_service_at_hours),
 status text not null default 'clear' check(status in ('clear','grounded')),
 grounded_at timestamptz,
 scheduled_release_at timestamptz,
 service_count integer not null default 0 check(service_count>=0),
 updated_at timestamptz not null default now(),
 simulation_only boolean not null default true check(simulation_only),
 unique(aircraft_id,organization_id),
 foreign key(aircraft_id,organization_id) references public.aircraft(id,organization_id),
 check((status='clear' and grounded_at is null and scheduled_release_at is null)
  or(status='grounded' and grounded_at is not null and scheduled_release_at>grounded_at))
);
create index shadow_maintenance_states_org_idx on public.shadow_maintenance_states(organization_id,status);
create table public.shadow_maintenance_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 aircraft_id uuid not null,
 event_type text not null check(event_type in ('grounded','service_completed')),
 event_at timestamptz not null,
 hours_at_event numeric(12,2) not null check(hours_at_event>=0),
 next_due_at_hours numeric(12,2) not null,
 narrative text not null,
 simulation_only boolean not null default true check(simulation_only),
 foreign key(aircraft_id,organization_id) references public.aircraft(id,organization_id)
);
create index shadow_maintenance_events_org_idx on public.shadow_maintenance_events(organization_id,event_at desc);
create unique index shadow_maintenance_event_unique on public.shadow_maintenance_events(aircraft_id,event_type,next_due_at_hours);
do $rls$
declare n text;
begin
 foreach n in array array['shadow_maintenance_states','shadow_maintenance_events'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select on public.%I to authenticated',n);
  execute format('create policy %I on public.%I for select to authenticated
   using(exists(select 1 from public.organizations o where o.id=organization_id
   and o.owner_user_id=(select auth.uid())))',n||'_owner_read',n);
 end loop;
end $rls$;
create trigger shadow_maintenance_events_immutable before update or delete
 on public.shadow_maintenance_events for each row execute function ops_internal.prevent_sim_ledger_mutation();

create or replace function ops_internal.advance_shadow_maintenance(p_at timestamptz default now())
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $maintenance$
declare
 item record;
 new_groundings integer:=0;
 completed_services integer:=0;
begin
 if p_at is null then raise exception 'Maintenance simulation time required';end if;
 perform pg_advisory_xact_lock(505,9105);
 if exists (
   select 1 from public.aircraft a
   join public.shadow_aircraft_states s on s.aircraft_id=a.id
   left join ops_internal.shadow_maintenance_models m on m.aircraft_type=a.aircraft_type
   where m.aircraft_type is null
 ) then raise exception 'Unknown fictional maintenance model: fail closed'; end if;

 insert into public.shadow_maintenance_states(
  aircraft_id,organization_id,registration_snapshot,aircraft_type_snapshot,
  interval_hours,service_duration_hours,due_at_hours
 )
 select a.id,a.organization_id,a.registration,a.aircraft_type,
  m.assumed_service_interval_hours,m.assumed_service_duration_hours,
  m.assumed_service_interval_hours
 from public.aircraft a
 join public.shadow_aircraft_states s on s.aircraft_id=a.id
 join ops_internal.shadow_maintenance_models m on m.aircraft_type=a.aircraft_type
 on conflict(aircraft_id) do nothing;

 for item in
  select ms.aircraft_id,ms.organization_id,ms.status,ms.interval_hours,
   ms.service_duration_hours,ms.due_at_hours,ms.grounded_at,
   ms.scheduled_release_at,s.accumulated_hypothetical_hours,s.phase
  from public.shadow_maintenance_states ms
  join public.shadow_aircraft_states s on s.aircraft_id=ms.aircraft_id
  order by ms.aircraft_id for update of ms,s
 loop
  if item.status='grounded' then
   if item.scheduled_release_at<=p_at and item.phase='parked' then
    update public.shadow_maintenance_states
    set status='clear',grounded_at=null,scheduled_release_at=null,
     last_service_at_hours=item.accumulated_hypothetical_hours,
     due_at_hours=item.accumulated_hypothetical_hours+item.interval_hours,
     service_count=service_count+1,updated_at=p_at
    where aircraft_id=item.aircraft_id;
    insert into public.shadow_maintenance_events(
      organization_id,aircraft_id,event_type,event_at,hours_at_event,
      next_due_at_hours,narrative)
    values(item.organization_id,item.aircraft_id,'service_completed',p_at,
      item.accumulated_hypothetical_hours,
      item.accumulated_hypothetical_hours+item.interval_hours,
      'Only simulated technical service cycle completed; no real airworthiness release.');
    completed_services:=completed_services+1;
   end if;
  elsif item.accumulated_hypothetical_hours>=item.due_at_hours then
   -- Do not start maintenance while a hypothetical flight is in progress.
   if item.phase='parked' then
    update public.shadow_maintenance_states
     set status='grounded',grounded_at=p_at,
      scheduled_release_at=p_at+item.service_duration_hours::double precision*interval '1 hour',
      updated_at=p_at
     where aircraft_id=item.aircraft_id;
    insert into public.shadow_maintenance_events(
      organization_id,aircraft_id,event_type,event_at,hours_at_event,
      next_due_at_hours,narrative)
    values(item.organization_id,item.aircraft_id,'grounded',p_at,
      item.accumulated_hypothetical_hours,item.due_at_hours,
      'Fictional inspection threshold reached; hypothetical aircraft grounded.');
    new_groundings:=new_groundings+1;
   end if;
  end if;
 end loop;
 return jsonb_build_object('new_groundings',new_groundings,
  'services_completed',completed_services,'simulation_only',true);
end $maintenance$;
revoke all on function ops_internal.advance_shadow_maintenance(timestamptz)
 from public,anon,authenticated;

create or replace function ops_internal.shadow_maintenance_can_fly(
 p_aircraft uuid,p_hours numeric
) returns boolean language sql stable security invoker set search_path=pg_catalog as $can$
 select p_aircraft is not null and p_hours is not null and p_hours>0
  and exists (
    select 1 from public.shadow_maintenance_states m
    join public.shadow_aircraft_states s on s.aircraft_id=m.aircraft_id
    where m.aircraft_id=p_aircraft and m.organization_id=s.organization_id
      and m.status='clear'
      and s.accumulated_hypothetical_hours+p_hours<=m.due_at_hours
  );
$can$;
revoke all on function ops_internal.shadow_maintenance_can_fly(uuid,numeric)
 from public,anon,authenticated;
