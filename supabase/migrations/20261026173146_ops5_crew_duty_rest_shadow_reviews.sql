-- OPS 5.0: conservative, auditable duty/rest snapshots for every new crew screening.
-- NOT EASA/FAA duty-time certification. Illustrative limits must never authorize a flight.
alter table public.crew_screening_checks
 add constraint crew_screening_checks_id_org_unique unique(id,organization_id);

create table public.crew_duty_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 screening_check_id uuid not null,
 screening_id uuid not null,
 employee_id uuid not null,
 proposed_start_at timestamptz,
 proposed_end_at timestamptz,
 policy_code text not null default 'illustrative_crew_rest_v1'
   check(policy_code='illustrative_crew_rest_v1'),
 max_duty_hours_model numeric(5,2) not null default 14.00
   check(max_duty_hours_model=14.00),
 min_rest_hours_model numeric(5,2) not null default 11.00
   check(min_rest_hours_model=11.00),
 max_7d_hours_model numeric(5,2) not null default 60.00
   check(max_7d_hours_model=60.00),
 max_28d_hours_model numeric(6,2) not null default 190.00
   check(max_28d_hours_model=190.00),
 last_recorded_duty_end timestamptz,
 next_recorded_duty_start timestamptz,
 observed_7d_hours numeric(9,2) not null default 0
   check(observed_7d_hours>=0),
 observed_28d_hours numeric(9,2) not null default 0
   check(observed_28d_hours>=0),
 overlapping_confirmed_blocks int not null default 0
   check(overlapping_confirmed_blocks>=0),
 leave_conflict boolean not null default false,
 roster_complete boolean not null default false check(not roster_complete),
 status text not null default 'blocked' check(status='blocked'),
 blockers text[] not null,
 checked_at timestamptz not null default now(),
 unique(screening_check_id),
 foreign key(screening_check_id,organization_id)
   references public.crew_screening_checks(id,organization_id),
 foreign key(screening_id,organization_id)
   references public.crew_screening_runs(id,organization_id),
 foreign key(employee_id,organization_id)
   references public.employees(id,organization_id),
 check((proposed_start_at is null and proposed_end_at is null)
   or (proposed_start_at is not null and proposed_end_at is not null
        and proposed_start_at<proposed_end_at))
);
create index crew_duty_reviews_org_recent_idx
 on public.crew_duty_reviews(organization_id,checked_at desc);
create index crew_duty_reviews_employee_idx
 on public.crew_duty_reviews(organization_id,employee_id,checked_at desc);
alter table public.crew_duty_reviews enable row level security;
revoke all on public.crew_duty_reviews from public,anon,authenticated;
grant select on public.crew_duty_reviews to authenticated;
create policy crew_duty_reviews_owner_read on public.crew_duty_reviews
 for select to authenticated using (
  exists(select 1 from public.organizations o
    where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 );
create trigger crew_duty_reviews_append_only before update or delete
 on public.crew_duty_reviews for each row
 execute function ops_internal.prevent_sim_ledger_mutation();

create or replace function ops_internal.review_crew_duty_check(p_check uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 c record;
 s record;
 prior_end timestamptz;
 next_start timestamptz;
 h7 numeric(9,2):=0;
 h28 numeric(9,2):=0;
 overlap_count int:=0;
 leave_hit boolean:=false;
 recorded_count int:=0;
 blockers text[];
 v_duty_h numeric;
begin
 select * into c from public.crew_screening_checks where id=p_check;
 if not found then raise exception 'Screening check not found';end if;
 select * into s from public.crew_screening_runs
  where id=c.screening_id and organization_id=c.organization_id;
 if not found then raise exception 'Screening run not found';end if;
 if exists(select 1 from public.crew_duty_reviews where screening_check_id=p_check) then
  return 0;
 end if;

 blockers:=array['ROSTER_COMPLETENESS_UNVERIFIED']::text[];
 if s.proposed_start_at is null or s.proposed_end_at is null then
  blockers:=array_append(blockers,'PLANNED_DUTY_WINDOW_UNKNOWN');
 else
  v_duty_h:=extract(epoch from (s.proposed_end_at-s.proposed_start_at))/3600.0;
  if v_duty_h>14 then
   blockers:=array_append(blockers,'ILLUSTRATIVE_DUTY_WINDOW_GT_14H');
  end if;

  select max(b.ends_at) into prior_end
   from public.crew_duty_blocks b
   where b.organization_id=c.organization_id and b.employee_id=c.employee_id
    and b.state in ('confirmed','operational_lock')
    and b.kind in ('flight','positioning','briefing','standby')
    and b.ends_at<=s.proposed_start_at;
  select min(b.starts_at) into next_start
   from public.crew_duty_blocks b
   where b.organization_id=c.organization_id and b.employee_id=c.employee_id
    and b.state in ('confirmed','operational_lock')
    and b.kind in ('flight','positioning','briefing','standby')
    and b.starts_at>=s.proposed_end_at;
  if prior_end is null then
   blockers:=array_append(blockers,'PREVIOUS_DUTY_HISTORY_NOT_ESTABLISHED');
  elsif (s.proposed_start_at-prior_end)<interval '11 hours' then
   blockers:=array_append(blockers,'ILLUSTRATIVE_REST_GAP_LT_11H');
  end if;
  if next_start is not null and (next_start-s.proposed_end_at)<interval '11 hours' then
   blockers:=array_append(blockers,'ILLUSTRATIVE_FOLLOWING_REST_GAP_LT_11H');
  end if;

  select count(*),
   round(coalesce(sum(greatest(0,
    extract(epoch from (
      least(b.ends_at,s.proposed_start_at) -
      greatest(b.starts_at,s.proposed_start_at-interval '7 days')
    ))/3600.0)),0)::numeric,2),
   round(coalesce(sum(greatest(0,
    extract(epoch from (
      least(b.ends_at,s.proposed_start_at) -
      greatest(b.starts_at,s.proposed_start_at-interval '28 days')
    ))/3600.0)),0)::numeric,2)
  into recorded_count,h7,h28
  from public.crew_duty_blocks b
  where b.organization_id=c.organization_id and b.employee_id=c.employee_id
   and b.state in ('confirmed','operational_lock')
   and b.kind in ('flight','positioning','briefing','standby')
   and b.starts_at<s.proposed_start_at
   and b.ends_at>s.proposed_start_at-interval '28 days';

  if h7+v_duty_h>60 then
   blockers:=array_append(blockers,'ILLUSTRATIVE_7D_DUTY_GT_60H');
  end if;
  if h28+v_duty_h>190 then
   blockers:=array_append(blockers,'ILLUSTRATIVE_28D_DUTY_GT_190H');
  end if;
  select count(*) into overlap_count
   from public.crew_duty_blocks b
   where b.organization_id=c.organization_id and b.employee_id=c.employee_id
    and b.state in ('confirmed','operational_lock')
    and tstzrange(b.starts_at,b.ends_at,'[)') &&
        tstzrange(s.proposed_start_at,s.proposed_end_at,'[)');
  if overlap_count>0 then
   blockers:=array_append(blockers,'CONFIRMED_DUTY_OR_REST_OVERLAP');
  end if;
  select exists(select 1 from public.leave_requests l
   where l.organization_id=c.organization_id and l.employee_id=c.employee_id
    and l.status in ('submitted','approved')
    and l.starts_on <= (s.proposed_end_at at time zone 'UTC')::date
    and l.ends_on >= (s.proposed_start_at at time zone 'UTC')::date)
  into leave_hit;
  if leave_hit then blockers:=array_append(blockers,'ABSENCE_OVERLAP');end if;
 end if;

 insert into public.crew_duty_reviews(
  organization_id,screening_check_id,screening_id,employee_id,
  proposed_start_at,proposed_end_at,
  last_recorded_duty_end,next_recorded_duty_start,
  observed_7d_hours,observed_28d_hours,
  overlapping_confirmed_blocks,leave_conflict,blockers
 ) values(
  c.organization_id,c.id,c.screening_id,c.employee_id,
  s.proposed_start_at,s.proposed_end_at,
  prior_end,next_start,h7,h28,overlap_count,leave_hit,blockers
 ) on conflict(screening_check_id) do nothing;
 return 1;
end; $fn$;
revoke all on function ops_internal.review_crew_duty_check(uuid)
 from public,anon,authenticated;

create or replace function ops_internal.crew_duty_auto_review()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 perform ops_internal.review_crew_duty_check(new.id);
 return new;
end; $fn$;
revoke all on function ops_internal.crew_duty_auto_review()
 from public,anon,authenticated;
create trigger crew_duty_review_after_screening_check
 after insert on public.crew_screening_checks
 for each row execute function ops_internal.crew_duty_auto_review();

-- Add reviews to already recorded checks without altering any historical result.
do $backfill$
declare item record;
begin
 for item in select c.id from public.crew_screening_checks c
  where not exists(select 1 from public.crew_duty_reviews d
   where d.screening_check_id=c.id)
 loop
  perform ops_internal.review_crew_duty_check(item.id);
 end loop;
end $backfill$;
