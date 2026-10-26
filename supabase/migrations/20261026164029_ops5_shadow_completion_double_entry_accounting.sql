-- OPS 5.0: bounded, idempotent, balanced purely hypothetical flight economics.
-- This is simulation-only accounting: no cash payments, no real flight release,
-- no customer invoices, and no externally recognized turnover.

-- Preserve the existing daily fleet-holding worker after narrowing its
-- per-day uniqueness to that particular source kind.
do $compat$
declare definition text;
begin
 select pg_get_functiondef('ops_internal.simulate_fleet_holding_day(date)'::regprocedure)
  into definition;
 if position('on conflict(organization_id,source_kind,source_day) do nothing' in definition)=0 then
  raise exception 'Daily holding worker incompatible: migration stopped';
 end if;
 execute replace(definition,
  'on conflict(organization_id,source_kind,source_day) do nothing',
  'on conflict do nothing');
end $compat$;

alter table public.sim_ledger_accounts drop constraint sim_ledger_accounts_code_check;
alter table public.sim_ledger_accounts add constraint sim_ledger_accounts_code_check
 check (code in (
 'FLEET_HOLDING_EXPENSE','ACCRUED_SIM_LIABILITY',
 'SHADOW_SCENARIO_RECEIVABLE','SHADOW_CHARTER_REVENUE',
 'SHADOW_CHARTER_EXPENSE','SHADOW_POSITIONING_EXPENSE'));
alter table public.sim_ledger_accounts drop constraint sim_ledger_accounts_class_check;
alter table public.sim_ledger_accounts add constraint sim_ledger_accounts_class_check
 check (class in ('expense','liability','asset','revenue'));

alter table public.sim_journals add column shadow_outcome_id uuid;
alter table public.sim_journals add column positioning_leg_id uuid;

alter table public.shadow_flight_outcomes
 add constraint shadow_flight_outcomes_id_org_unique unique(id,organization_id);
alter table public.sim_journals
 add constraint sim_journals_shadow_outcome_org_fk
 foreign key(shadow_outcome_id,organization_id)
 references public.shadow_flight_outcomes(id,organization_id);
alter table public.sim_journals
 add constraint sim_journals_positioning_leg_org_fk
 foreign key(positioning_leg_id,organization_id)
 references public.shadow_positioning_legs(id,organization_id);

alter table public.sim_journals
 drop constraint sim_journals_organization_id_source_kind_source_day_key;
alter table public.sim_journals drop constraint sim_journals_source_kind_check;
alter table public.sim_journals
 add constraint sim_journals_source_kind_check
 check (source_kind in (
   'fictional_daily_fleet_holding',
   'shadow_charter_completion',
   'shadow_positioning_completion'));
alter table public.sim_journals add constraint sim_journals_source_ref_check
 check (
  (source_kind='fictional_daily_fleet_holding'
    and shadow_outcome_id is null and positioning_leg_id is null)
  or (source_kind='shadow_charter_completion'
    and shadow_outcome_id is not null and positioning_leg_id is null)
  or (source_kind='shadow_positioning_completion'
    and shadow_outcome_id is null and positioning_leg_id is not null)
 );

create unique index sim_journals_fleet_day_unique
 on public.sim_journals(organization_id,source_day)
 where source_kind='fictional_daily_fleet_holding';
create unique index sim_journals_shadow_outcome_unique
 on public.sim_journals(organization_id,shadow_outcome_id)
 where shadow_outcome_id is not null;
create unique index sim_journals_shadow_positioning_unique
 on public.sim_journals(organization_id,positioning_leg_id)
 where positioning_leg_id is not null;
create index sim_journals_source_kind_org_idx
 on public.sim_journals(organization_id,source_kind,source_day desc);

create or replace function ops_internal.post_completed_shadow_economy(
 p_limit integer default 100
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog as $accounting$
declare
 rec record;
 j uuid;
 id_receivable uuid; id_revenue uuid; id_expense uuid; id_liability uuid;
 flights_posted integer:=0;
 ferries_posted integer:=0;
 lines_inserted integer;
begin
 if p_limit is null or p_limit<1 or p_limit>200 then
  raise exception 'Economy processing limit must be 1..200';
 end if;
 perform pg_advisory_xact_lock(505,9335);

 -- Only FINISHED shadow scenarios with both positive fictional model numbers
 -- qualify. A planned/blocked flight can never be financially recognized.
 for rec in
  select o.id outcome_id,o.organization_id,o.completed_at,
    o.model_revenue_eur,o.model_cost_eur,
    f.id flight_id,f.aircraft_id,f.registration_snapshot,
    f.departure_icao,f.arrival_icao
  from public.shadow_flight_outcomes o
  join public.shadow_flights f
    on f.id=o.shadow_flight_id and f.organization_id=o.organization_id
  where f.status='completed' and o.simulation_only and f.simulation_only
   and o.model_revenue_eur>0 and o.model_cost_eur>0
   and not exists (
    select 1 from public.sim_journals j2
    where j2.organization_id=o.organization_id and j2.shadow_outcome_id=o.id)
  order by o.completed_at,o.id
  limit p_limit
 loop
  insert into public.sim_ledger_accounts(organization_id,code,title,class)
   values
   (rec.organization_id,'SHADOW_SCENARIO_RECEIVABLE','Rein fiktive Charter-Forderung','asset'),
   (rec.organization_id,'SHADOW_CHARTER_REVENUE','Rein fiktiver Charter-Erlös','revenue'),
   (rec.organization_id,'SHADOW_CHARTER_EXPENSE','Rein fiktive Charter-Kosten','expense'),
   (rec.organization_id,'ACCRUED_SIM_LIABILITY','Fiktive offene Kosten','liability')
  on conflict(organization_id,code) do nothing;

  select id into strict id_receivable from public.sim_ledger_accounts
    where organization_id=rec.organization_id and code='SHADOW_SCENARIO_RECEIVABLE';
  select id into strict id_revenue from public.sim_ledger_accounts
    where organization_id=rec.organization_id and code='SHADOW_CHARTER_REVENUE';
  select id into strict id_expense from public.sim_ledger_accounts
    where organization_id=rec.organization_id and code='SHADOW_CHARTER_EXPENSE';
  select id into strict id_liability from public.sim_ledger_accounts
    where organization_id=rec.organization_id and code='ACCRUED_SIM_LIABILITY';

  j:=null;
  insert into public.sim_journals(
   organization_id,source_kind,source_day,shadow_outcome_id,description)
  values (
   rec.organization_id,'shadow_charter_completion',
   (rec.completed_at at time zone 'UTC')::date,rec.outcome_id,
   'Nur hypothetische Abrechnung: '||rec.departure_icao||' → '||rec.arrival_icao||
   ' / '||rec.registration_snapshot
  ) on conflict do nothing returning id into j;
  if j is null then continue; end if;

  insert into public.sim_journal_lines(
   organization_id,journal_id,account_id,aircraft_id,side,amount_eur,description)
  select rec.organization_id,j,x.account_id,rec.aircraft_id,
   x.side,x.amount,x.description
  from (values
   (id_receivable,'debit',rec.model_revenue_eur,'Nur hypothetisch: Forderung'),
   (id_revenue,'credit',rec.model_revenue_eur,'Nur hypothetisch: Erlös'),
   (id_expense,'debit',rec.model_cost_eur,'Nur hypothetisch: Flugkosten'),
   (id_liability,'credit',rec.model_cost_eur,'Nur hypothetisch: Kostenabgrenzung')
  ) as x(account_id,side,amount,description);

  insert into public.audit_events(
   organization_id,actor_role,event_type,resource_type,resource_id,details)
  values (
   rec.organization_id,'simulation_worker','shadow_economy_posted','sim_journals',j,
   jsonb_build_object('source','shadow_charter_completion',
    'source_id',rec.outcome_id,'model_revenue_eur',rec.model_revenue_eur,
    'model_cost_eur',rec.model_cost_eur,'simulation_only',true,
    'cash_movement',false,'real_flight',false)
  );
  flights_posted:=flights_posted+1;
 end loop;

 for rec in
  select lp.id leg_id,lp.organization_id,lp.arrived_at,
   lp.aircraft_id,lp.from_icao,lp.to_icao,lp.fictional_cost_eur
  from public.shadow_positioning_legs lp
  where lp.status='completed' and lp.simulation_only
   and lp.arrived_at is not null and lp.fictional_cost_eur>0
   and not exists(
    select 1 from public.sim_journals j2
    where j2.organization_id=lp.organization_id and j2.positioning_leg_id=lp.id)
  order by lp.arrived_at,lp.id
  limit p_limit
 loop
  insert into public.sim_ledger_accounts(organization_id,code,title,class)
   values
   (rec.organization_id,'SHADOW_POSITIONING_EXPENSE','Rein fiktive Überführungskosten','expense'),
   (rec.organization_id,'ACCRUED_SIM_LIABILITY','Fiktive offene Kosten','liability')
  on conflict(organization_id,code) do nothing;

  select id into strict id_expense from public.sim_ledger_accounts
   where organization_id=rec.organization_id and code='SHADOW_POSITIONING_EXPENSE';
  select id into strict id_liability from public.sim_ledger_accounts
   where organization_id=rec.organization_id and code='ACCRUED_SIM_LIABILITY';

  j:=null;
  insert into public.sim_journals(
   organization_id,source_kind,source_day,positioning_leg_id,description)
  values(rec.organization_id,'shadow_positioning_completion',
   (rec.arrived_at at time zone 'UTC')::date,rec.leg_id,
   'Nur hypothetische Überführungskosten: '||rec.from_icao||' → '||rec.to_icao)
  on conflict do nothing returning id into j;
  if j is null then continue;end if;

  insert into public.sim_journal_lines(
   organization_id,journal_id,account_id,aircraft_id,side,amount_eur,description)
  values
   (rec.organization_id,j,id_expense,rec.aircraft_id,'debit',
    rec.fictional_cost_eur,'Nur hypothetisch: Überführungskosten'),
   (rec.organization_id,j,id_liability,rec.aircraft_id,'credit',
    rec.fictional_cost_eur,'Nur hypothetisch: Kostenabgrenzung');

  insert into public.audit_events(
   organization_id,actor_role,event_type,resource_type,resource_id,details)
  values(rec.organization_id,'simulation_worker','shadow_economy_posted',
   'sim_journals',j,
   jsonb_build_object('source','shadow_positioning_completion',
    'source_id',rec.leg_id,'model_cost_eur',rec.fictional_cost_eur,
    'simulation_only',true,'cash_movement',false,'real_flight',false));
  ferries_posted:=ferries_posted+1;
 end loop;
 return jsonb_build_object(
  'shadow_charters_posted',flights_posted,
  'shadow_positionings_posted',ferries_posted,
  'simulation_only',true,'cash_movement',false);
end $accounting$;
revoke all on function ops_internal.post_completed_shadow_economy(integer)
 from public,anon,authenticated;

-- The worker runs 10 minutes after the hourly flight-state simulation.
select cron.schedule('aervelys-ops5-shadow-economy-hourly','10 * * * *',
 'select ops_internal.post_completed_shadow_economy(100);');
