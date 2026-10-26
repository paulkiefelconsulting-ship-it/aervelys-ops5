-- OPS 5.0 – deterministic blocked crew screening, org-safe relationships and duty-conflict schema.
-- All crew/aircraft scheduling remains shadow-only. No dispatch release is possible.
create table public.crew_duty_blocks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 employee_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 kind text not null check(kind in ('flight','positioning','briefing','standby','rest','absence')),
 state text not null default 'draft' check(state in ('draft','confirmed','operational_lock','cancelled')),
 location_icao text check(location_icao is null or location_icao ~ '^[A-Z0-9]{4}$'),
 source_reference text not null,
 created_at timestamptz not null default now(),
 check(starts_at<ends_at),
 foreign key(employee_id,organization_id) references public.employees(id,organization_id),
 unique(id,organization_id),
 constraint crew_duty_no_confirmed_overlap exclude using gist (
   employee_id with =,tstzrange(starts_at,ends_at,'[)') with &&
 ) where (state in ('confirmed','operational_lock'))
);
create index crew_duty_org_employee_idx on public.crew_duty_blocks(organization_id,employee_id,starts_at);

create table public.crew_screening_runs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 request_id uuid not null,
 screening_day date not null,
 candidate_aircraft_id uuid,
 proposed_start_at timestamptz,
 proposed_end_at timestamptz,
 aircraft_conflict boolean not null default false,
 status text not null default 'blocked' check(status='blocked'),
 reason text not null,
 created_at timestamptz not null default now(),
 unique(id,organization_id),
 unique(organization_id,request_id,screening_day),
 foreign key(request_id,organization_id) references public.charter_requests(id,organization_id),
 foreign key(candidate_aircraft_id,organization_id) references public.aircraft(id,organization_id)
);
create index crew_screening_runs_org_time_idx on public.crew_screening_runs(organization_id,created_at desc);

create table public.crew_screening_checks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 screening_id uuid not null,
 employee_id uuid not null,
 crew_role text not null check(crew_role in ('PIC','SIC')),
 aircraft_type text not null,
 employment_verified boolean not null default false,
 rating_verified boolean not null default false,
 medical_verified boolean not null default false,
 operator_checks_verified boolean not null default false,
 credentials_verified boolean not null default false,
 duty_roster_verified boolean not null default false,
 location_verified boolean not null default false,
 home_base_matches boolean not null default false,
 overlap_conflict boolean not null default false,
 leave_conflict boolean not null default false,
 status text not null default 'blocked' check(status='blocked'),
 blocking_reasons text[] not null,
 created_at timestamptz not null default now(),
 unique(screening_id,employee_id),
 foreign key(employee_id,organization_id) references public.employees(id,organization_id),
 foreign key(screening_id,organization_id) references public.crew_screening_runs(id,organization_id)
);
create index crew_screening_checks_run_idx on public.crew_screening_checks(organization_id,screening_id,crew_role);
do $rls$
declare tbl text;
begin
 foreach tbl in array array['crew_duty_blocks','crew_screening_runs','crew_screening_checks']
 loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format(
   'create policy %I on public.%I for select to authenticated using (
     exists (select 1 from public.organizations o where o.id=organization_id
       and o.owner_user_id=(select auth.uid())))',
   tbl||'_owner_read',tbl);
 end loop;
end $rls$;

create or replace function ops_internal.screen_charter_crew(
 p_request uuid,p_screen_day date default (now() at time zone 'UTC')::date
) returns integer language plpgsql security definer set search_path=pg_catalog as $body$
declare
 r record;a record;ac record;pilot record;
 run_id uuid;v_start timestamptz;v_end timestamptz;
 v_overlap boolean:=false;v_leave boolean;v_duty_overlap boolean;
 v_employment boolean;v_rating boolean;v_medical boolean;v_checks boolean;
 v_cred boolean;v_home boolean;v_reasons text[];v_count integer:=0;
 v_day date;
begin
 if p_screen_day is null then raise exception 'screening day required'; end if;
 select * into r from public.charter_requests where id=p_request;
 if not found then raise exception 'unknown charter request'; end if;
 select * into ac from public.charter_assessments where request_id=r.id;
 if not found then raise exception 'automatic charter precheck missing'; end if;
 select * into a from public.aircraft where id=ac.candidate_aircraft_id
  and organization_id=r.organization_id;
 v_day:=(r.departure_at at time zone 'UTC')::date;
 if ac.assumed_block_hours is not null then
  v_start:=r.departure_at-interval '2 hours';
  v_end:=r.departure_at+(ac.assumed_block_hours::double precision*interval '1 hour')+interval '2 hours';
 end if;
 if a.id is not null and v_end is not null then
  select exists(select 1 from public.resource_reservations x
   where x.organization_id=r.organization_id and x.aircraft_id=a.id
    and x.state in ('confirmed','operational_lock')
    and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
   into v_overlap;
 end if;

 insert into public.crew_screening_runs(
   organization_id,request_id,screening_day,candidate_aircraft_id,
   proposed_start_at,proposed_end_at,aircraft_conflict,reason
 ) values(
   r.organization_id,r.id,p_screen_day,a.id,v_start,v_end,v_overlap,
   case when v_end is null then 'ROUTE_DURATION_NOT_VERIFIED'
    when a.id is null then 'NO_AIRCRAFT'
    when a.operational_status<>'available' then 'AIRCRAFT_NOT_AVAILABLE'
    when a.current_icao is distinct from r.departure_icao then 'AIRCRAFT_LOCATION_NOT_VERIFIED'
    when v_overlap then 'AIRCRAFT_TIME_CONFLICT'
    else 'FULL_OPERATIONAL_RELEASE_CHECKS_NOT_IMPLEMENTED' end
 ) on conflict(organization_id,request_id,screening_day) do nothing
 returning id into run_id;
 if run_id is null then return 0; end if;

 if a.id is not null then
  for pilot in
   select e.id,e.crew_role,e.home_base_icao,e.employment_status,
    q.id rating_id,q.status rating_status,q.valid_until,q.simulation_only
   from public.employees e join public.crew_qualifications q
    on q.employee_id=e.id and q.organization_id=e.organization_id
   where e.organization_id=r.organization_id and q.aircraft_type=a.aircraft_type
    and ((e.crew_role='PIC' and q.qualification in ('PIC','PIC_SIC'))
      or (e.crew_role='SIC' and q.qualification in ('SIC','PIC_SIC')))
   order by e.employee_code
  loop
   v_employment:=pilot.employment_status='active';
   v_rating:=pilot.rating_status='verified' and not pilot.simulation_only
     and pilot.valid_until is not null and pilot.valid_until>=v_day;
   select coalesce(c.verified_for_operations,false)
     and c.legacy_medical_valid_until is not null
     and c.legacy_medical_valid_until>=v_day
    into v_medical from ops_private.employee_compliance c where c.employee_id=pilot.id;
   v_medical:=coalesce(v_medical,false);

   select coalesce(qe.verified_for_operations,false)
     and qe.licence_valid_until is not null and qe.licence_valid_until>=v_day
     and qe.line_check_valid_until is not null and qe.line_check_valid_until>=v_day
     and qe.operator_check_valid_until is not null and qe.operator_check_valid_until>=v_day
    into v_checks from ops_private.qualification_evidence qe where qe.qualification_id=pilot.rating_id;
   v_checks:=coalesce(v_checks,false);

   select count(distinct ce.credential_type)=5 into v_cred
    from ops_private.crew_credential_evidence ce
    where ce.employee_id=pilot.id and ce.verified_for_operations
     and ce.credential_type in ('TYPE_RATING','LICENSE','MEDICAL','LINE_CHECK','OPC')
     and ce.valid_until is not null and ce.valid_until>=v_day
     and (ce.valid_from is null or ce.valid_from<=v_day)
     and (ce.credential_type<>'TYPE_RATING' or ce.aircraft_registration=a.registration);
   v_cred:=coalesce(v_cred,false);

   if v_end is not null then
    select exists(select 1 from public.leave_requests lr
     where lr.organization_id=r.organization_id and lr.employee_id=pilot.id
      and lr.status in ('submitted','approved')
      and lr.starts_on <= (v_end at time zone 'UTC')::date
      and lr.ends_on >= (v_start at time zone 'UTC')::date)
     into v_leave;
    select exists(select 1 from public.crew_duty_blocks db
     where db.organization_id=r.organization_id and db.employee_id=pilot.id
      and db.state in ('confirmed','operational_lock')
      and tstzrange(db.starts_at,db.ends_at,'[)') &&
          tstzrange(v_start,v_end,'[)'))
     into v_duty_overlap;
   else
    v_leave:=false;v_duty_overlap:=false;
   end if;

   v_home:=pilot.home_base_icao=r.departure_icao;
   v_reasons:=array_remove(array[
     case when not v_employment then 'EMPLOYMENT_NOT_VERIFIED' end,
     case when not v_rating then 'TYPE_RATING_NOT_VERIFIED' end,
     case when not v_medical then 'MEDICAL_NOT_VERIFIED' end,
     case when not v_checks then 'OPERATOR_CHECKS_NOT_VERIFIED' end,
     case when not v_cred then 'CREDENTIAL_SET_NOT_VERIFIED' end,
     case when v_leave then 'LEAVE_CONFLICT' end,
     case when v_duty_overlap then 'DUTY_OVERLAP' end,
     'DUTY_AND_REST_ROSTER_NOT_VERIFIED',
     'CREW_CURRENT_LOCATION_NOT_VERIFIED'
   ],null);
   insert into public.crew_screening_checks(
    organization_id,screening_id,employee_id,crew_role,aircraft_type,
    employment_verified,rating_verified,medical_verified,operator_checks_verified,
    credentials_verified,duty_roster_verified,location_verified,home_base_matches,
    overlap_conflict,leave_conflict,blocking_reasons
   ) values(
    r.organization_id,run_id,pilot.id,pilot.crew_role,a.aircraft_type,
    v_employment,v_rating,v_medical,v_checks,v_cred,false,false,
    coalesce(v_home,false),v_duty_overlap,v_leave,v_reasons
   );
   v_count:=v_count+1;
  end loop;
 end if;

 insert into public.audit_events(
  organization_id,actor_role,event_type,resource_type,resource_id,details)
 values(r.organization_id,'simulation_worker','crew_screening_created',
  'crew_screening_runs',run_id,
  jsonb_build_object('request',r.id,'candidate_profiles',v_count,'decision','blocked'));
 return 1;
end; $body$;
revoke all on function ops_internal.screen_charter_crew(uuid,date) from public,anon,authenticated;

create or replace function ops_internal.screen_new_charter()
returns trigger language plpgsql security definer set search_path=pg_catalog as $body$
begin
 perform ops_internal.screen_charter_crew(new.id,(now() at time zone 'UTC')::date);
 return new;
end; $body$;
revoke all on function ops_internal.screen_new_charter() from public,anon,authenticated;
create trigger charter_crew_screening_after_insert
 after insert on public.charter_requests for each row
 execute function ops_internal.screen_new_charter();

create or replace function ops_internal.refresh_crew_screenings(
 p_day date default (now() at time zone 'UTC')::date
) returns integer language plpgsql security invoker set search_path=pg_catalog as $body$
declare r record;n integer:=0;
begin
 if p_day is null then raise exception 'day required';end if;
 for r in select cr.id from public.charter_requests cr where cr.status='draft'
  and cr.departure_at >= (p_day::timestamp at time zone 'UTC')
  and not exists(select 1 from public.crew_screening_runs sr
   where sr.request_id=cr.id and sr.screening_day=p_day)
  order by cr.created_at asc limit 200
 loop n:=n+ops_internal.screen_charter_crew(r.id,p_day);end loop;
 return n;
end; $body$;
revoke all on function ops_internal.refresh_crew_screenings(date) from public,anon,authenticated;
select cron.schedule('aervelys-ops5-crew-screen-daily','25 5 * * *',
 'select ops_internal.refresh_crew_screenings((now() at time zone ''UTC'')::date);');
select ops_internal.refresh_crew_screenings((now() at time zone 'UTC')::date);
