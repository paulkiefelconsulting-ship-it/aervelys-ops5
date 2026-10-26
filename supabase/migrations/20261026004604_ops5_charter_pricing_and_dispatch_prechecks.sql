-- OPS 5.0: commercially illustrative charter pricing + deterministic fail-closed dispatch screening.
-- Not a flight authorization or a real customer quote.
create table if not exists ops_internal.simulated_route_assumptions(
  departure_icao text not null check(departure_icao ~ '^[A-Z0-9]{4}$'),
  arrival_icao text not null check(arrival_icao ~ '^[A-Z0-9]{4}$'),
  assumed_block_hours numeric(5,2) not null check(assumed_block_hours > 0),
  primary key(departure_icao,arrival_icao)
);
revoke all on ops_internal.simulated_route_assumptions from public,anon,authenticated;
insert into ops_internal.simulated_route_assumptions
  (departure_icao,arrival_icao,assumed_block_hours) values
 ('EDAZ','LIML',1.85),('EDAZ','LSZH',1.55),('EDAZ','LOWW',1.30),
 ('EDDB','LFMN',2.25),('EDDB','EGLL',2.15)
on conflict (departure_icao,arrival_icao) do nothing;
comment on table ops_internal.simulated_route_assumptions is
 'Fictional planning assumptions only; not verified airport distances, routes or aircraft performance.';

create table public.charter_assessments(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 request_id uuid not null,
 candidate_aircraft_id uuid,
 candidate_registration text,
 candidate_aircraft_type text,
 candidate_operational_status text,
 candidate_location_icao text,
 candidate_homebase_icao text,
 pic_type_profiles integer not null default 0,
 sic_type_profiles integer not null default 0,
 assumed_block_hours numeric(5,2),
 illustrative_revenue_eur numeric(14,2),
 illustrative_cost_eur numeric(14,2),
 illustrative_margin_eur numeric(14,2),
 review_status text not null default 'blocked' check(review_status='blocked'),
 blocker_code text not null,
 blocker_detail text not null,
 pricing_model text not null default 'fictional_scenario_v1',
 evaluated_at timestamptz not null default now(),
 unique(organization_id,request_id),
 foreign key(request_id,organization_id)
  references public.charter_requests(id,organization_id),
 foreign key(candidate_aircraft_id,organization_id)
  references public.aircraft(id,organization_id)
);
create index charter_assessments_org_eval_idx on public.charter_assessments(organization_id,evaluated_at desc);
alter table public.charter_assessments enable row level security;
revoke all on public.charter_assessments from public,anon,authenticated;
grant select on public.charter_assessments to authenticated;
create policy charter_assessments_owner_read on public.charter_assessments
 for select to authenticated using (
 exists(select 1 from public.organizations o
  where o.id=organization_id and o.owner_user_id=(select auth.uid()))
);

create or replace function ops_internal.evaluate_charter_request(p_request uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $body$
declare
 r record;
 a record;
 h numeric;
 revenue numeric;
 costs numeric;
 pic_cnt integer;
 sic_cnt integer;
 block text;
 detail text;
begin
 select * into r from public.charter_requests where id=p_request;
 if not found then raise exception 'Request not found'; end if;

 -- A candidate is only a type/homebase suggestion: not aircraft assignment.
 select id,registration,aircraft_type,operational_status,current_icao,home_base_icao
 into a from public.aircraft where organization_id=r.organization_id
 order by (operational_status='available' and current_icao=r.departure_icao) desc,
  (home_base_icao=r.departure_icao) desc, registration asc limit 1;

 select assumed_block_hours into h from ops_internal.simulated_route_assumptions
  where departure_icao=r.departure_icao and arrival_icao=r.arrival_icao;
 if h is not null then
  -- Fictional budget numbers (EUR) for learning only; NOT market prices.
  revenue:=round((1200+h*3200+r.passengers*180)::numeric,2);
  costs:=round((500+h*2100+r.passengers*85)::numeric,2);
 end if;

 select
  count(distinct e.id) filter(where q.qualification='PIC' and e.crew_role='PIC'),
  count(distinct e.id) filter(where q.qualification='SIC' and e.crew_role='SIC')
 into pic_cnt,sic_cnt
 from public.crew_qualifications q join public.employees e
  on e.id=q.employee_id and e.organization_id=q.organization_id
 where q.organization_id=r.organization_id
   and a.id is not null and q.aircraft_type=a.aircraft_type;

 -- Every assessment is blocked until all independent authorizations, medicals,
 -- location, rest time and overlap checks have been added and tested.
 if a.id is null then
  block:='NO_AIRCRAFT';detail:='No aircraft in this organization.';
 elsif a.operational_status<>'available' then
  block:='AIRCRAFT_INACTIVE';detail:='Candidate aircraft is not operationally available.';
 elsif a.current_icao is distinct from r.departure_icao then
  block:='POSITION_UNVERIFIED';detail:='Candidate aircraft is not verified at departure.';
 elsif pic_cnt=0 or sic_cnt=0 then
  block:='NO_TYPE_ROLE_PAIR';detail:='No recorded matching PIC/SIC profiles for the candidate.';
 else
  block:='COMPLIANCE_CHECKS_NOT_IMPLEMENTED';
  detail:='Licences, medicals, operator checks, duty limits, positioning and conflicts must be verified.';
 end if;

 insert into public.charter_assessments(
  organization_id,request_id,candidate_aircraft_id,candidate_registration,
  candidate_aircraft_type,candidate_operational_status,candidate_location_icao,candidate_homebase_icao,
  pic_type_profiles,sic_type_profiles,assumed_block_hours,
  illustrative_revenue_eur,illustrative_cost_eur,illustrative_margin_eur,
  blocker_code,blocker_detail
 ) values(
  r.organization_id,r.id,a.id,a.registration,
  a.aircraft_type,a.operational_status,a.current_icao,a.home_base_icao,
  coalesce(pic_cnt,0),coalesce(sic_cnt,0),h,
  revenue,costs,case when revenue is not null then revenue-costs else null end,
  block,detail
 ) on conflict(organization_id,request_id) do nothing;
end; $body$;
revoke all on function ops_internal.evaluate_charter_request(uuid) from public,anon,authenticated;

create or replace function ops_internal.on_charter_request_created()
returns trigger language plpgsql security definer set search_path=pg_catalog as $body$
begin
 perform ops_internal.evaluate_charter_request(new.id);
 return new;
end; $body$;
revoke all on function ops_internal.on_charter_request_created() from public,anon,authenticated;

create trigger charter_auto_assess_insert
 after insert on public.charter_requests
 for each row execute function ops_internal.on_charter_request_created();

-- Backfill any already generated/manual charter requests; no duplicate approvals.
do $block$
declare r record;
begin
 for r in select id from public.charter_requests
  where not exists(select 1 from public.charter_assessments a where a.request_id=charter_requests.id)
 loop perform ops_internal.evaluate_charter_request(r.id); end loop;
end; $block$;
