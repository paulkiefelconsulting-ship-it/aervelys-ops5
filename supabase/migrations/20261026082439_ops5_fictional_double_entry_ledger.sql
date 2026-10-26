-- OPS 5.0 – simulation-only, append-only, balanced financial ledger
-- No customer payments, banking integration, cash balance changes or real liabilities.
-- All EUR amounts are explicitly fictional scenario assumptions.

create table ops_internal.fictional_aircraft_daily_rates (
 aircraft_type text primary key,
 assumed_holding_cost_eur numeric(14,2) not null check(assumed_holding_cost_eur>0),
 note text not null default 'Invented simulator parameter, NOT an actual operating cost.'
);
revoke all on ops_internal.fictional_aircraft_daily_rates from public,anon,authenticated;
insert into ops_internal.fictional_aircraft_daily_rates (aircraft_type,assumed_holding_cost_eur)
values ('Citation Longitude',360.00),('Citation CJ4',240.00),
       ('Phenom 300E',220.00),('PC-24',210.00),('Vision Jet G2',120.00);

create table public.sim_ledger_accounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 code text not null check(code in ('FLEET_HOLDING_EXPENSE','ACCRUED_SIM_LIABILITY')),
 title text not null,
 class text not null check(class in ('expense','liability')),
 currency text not null default 'EUR' check(currency='EUR'),
 simulation_only boolean not null default true check(simulation_only),
 created_at timestamptz not null default now(),
 unique(organization_id,code),
 unique(id,organization_id)
);

create table public.sim_journals (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 source_kind text not null check(source_kind='fictional_daily_fleet_holding'),
 source_day date not null,
 description text not null,
 status text not null default 'posted' check(status='posted'),
 currency text not null default 'EUR' check(currency='EUR'),
 simulation_only boolean not null default true check(simulation_only),
 posted_at timestamptz not null default now(),
 unique(organization_id,source_kind,source_day),
 unique(id,organization_id)
);

create table public.sim_journal_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 journal_id uuid not null,
 account_id uuid not null,
 aircraft_id uuid,
 side text not null check(side in ('debit','credit')),
 amount_eur numeric(14,2) not null check(amount_eur>0),
 description text not null,
 simulation_only boolean not null default true check(simulation_only),
 created_at timestamptz not null default now(),
 foreign key(journal_id,organization_id) references public.sim_journals(id,organization_id),
 foreign key(account_id,organization_id) references public.sim_ledger_accounts(id,organization_id),
 foreign key(aircraft_id,organization_id) references public.aircraft(id,organization_id),
 unique(id,organization_id)
);
create index sim_journals_recent_idx on public.sim_journals(organization_id,source_day desc);
create index sim_journal_lines_journal_idx on public.sim_journal_lines(organization_id,journal_id);

do $access$
declare t text;
begin
 foreach t in array array['sim_ledger_accounts','sim_journals','sim_journal_lines'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using
    (exists(select 1 from public.organizations o where o.id=organization_id
       and o.owner_user_id=(select auth.uid())))',t||'_owner_read',t);
 end loop;
end $access$;

-- Prevent any ledger entry from changing after insertion; corrections will
-- require a separately authorized reversing journal in a future phase.
create or replace function ops_internal.prevent_sim_ledger_mutation()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $mut$
begin
 raise exception 'Simulation ledger is append-only: corrections require new reversal journals';
end $mut$;
revoke all on function ops_internal.prevent_sim_ledger_mutation() from public,anon,authenticated;
create trigger sim_journals_no_mutation before update or delete on public.sim_journals
 for each row execute function ops_internal.prevent_sim_ledger_mutation();
create trigger sim_journal_lines_no_mutation before update or delete on public.sim_journal_lines
 for each row execute function ops_internal.prevent_sim_ledger_mutation();
create trigger sim_ledger_accounts_no_mutation before update or delete on public.sim_ledger_accounts
 for each row execute function ops_internal.prevent_sim_ledger_mutation();

-- Deferred integrity checks verify EACH journal has two or more posted lines
-- and total debits equal total credits at transaction commit.
create or replace function ops_internal.assert_sim_journal_balanced()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $bal$
declare j_id uuid;n bigint;debit_total numeric(18,2);credit_total numeric(18,2);
begin
 if tg_table_name='sim_journals' then j_id:=new.id; else j_id:=new.journal_id;end if;
 select count(*),
   coalesce(sum(amount_eur) filter(where side='debit'),0),
   coalesce(sum(amount_eur) filter(where side='credit'),0)
 into n,debit_total,credit_total
 from public.sim_journal_lines where journal_id=j_id;
 if n<2 or debit_total<=0 or credit_total<=0 or debit_total<>credit_total then
  raise exception 'Unbalanced synthetic journal %, lines %, debit %, credit %',
    j_id,n,debit_total,credit_total;
 end if;
 return null;
end $bal$;
revoke all on function ops_internal.assert_sim_journal_balanced() from public,anon,authenticated;
create constraint trigger sim_journals_balance_guard
 after insert on public.sim_journals deferrable initially deferred
 for each row execute function ops_internal.assert_sim_journal_balanced();
create constraint trigger sim_journal_lines_balance_guard
 after insert on public.sim_journal_lines deferrable initially deferred
 for each row execute function ops_internal.assert_sim_journal_balanced();

-- This function ONLY books fictional unpaid expenses against fictional
-- accrued liabilities. It never touches simulation_accounts or banks.
create or replace function ops_internal.simulate_fleet_holding_day(
 p_day date default (now() at time zone 'UTC')::date
) returns integer language plpgsql security invoker set search_path=pg_catalog as $run$
declare
 org record;
 craft record;
 j_id uuid;
 expense_id uuid;
 liability_id uuid;
 amount_total numeric(14,2);
 n integer:=0;
begin
 if p_day is null then raise exception 'UTC day is required';end if;
 for org in select id from public.organizations order by id loop
  -- Fail closed rather than silently omitting a newly added aircraft model.
  if exists (
   select 1 from public.aircraft a left join ops_internal.fictional_aircraft_daily_rates m
    on m.aircraft_type=a.aircraft_type
   where a.organization_id=org.id and m.aircraft_type is null
  ) then
   raise exception 'Unknown fictional aircraft rate for organization %',org.id;
  end if;
  if not exists(select 1 from public.aircraft where organization_id=org.id) then continue;end if;

  insert into public.sim_ledger_accounts(organization_id,code,title,class)
  values(org.id,'FLEET_HOLDING_EXPENSE','Fiktiver Flottenaufwand','expense'),
        (org.id,'ACCRUED_SIM_LIABILITY','Fiktive offene Kosten','liability')
  on conflict(organization_id,code) do nothing;
  select id into expense_id from public.sim_ledger_accounts
   where organization_id=org.id and code='FLEET_HOLDING_EXPENSE';
  select id into liability_id from public.sim_ledger_accounts
   where organization_id=org.id and code='ACCRUED_SIM_LIABILITY';

  j_id:=null;
  insert into public.sim_journals(organization_id,source_kind,source_day,description)
  values(org.id,'fictional_daily_fleet_holding',p_day,
    'Fiktive tägliche Flottenhaltung; keine Zahlung oder reale Verbindlichkeit')
  on conflict(organization_id,source_kind,source_day) do nothing returning id into j_id;
  if j_id is null then continue;end if;

  amount_total:=0;
  for craft in
   select a.id,a.registration,m.assumed_holding_cost_eur as amount_eur
   from public.aircraft a join ops_internal.fictional_aircraft_daily_rates m
      on m.aircraft_type=a.aircraft_type
   where a.organization_id=org.id order by a.registration
  loop
   insert into public.sim_journal_lines
    (organization_id,journal_id,account_id,aircraft_id,side,amount_eur,description)
   values(org.id,j_id,expense_id,craft.id,'debit',craft.amount_eur,
     'Nur Simulation: Flottenhaltung '||craft.registration);
   amount_total:=amount_total+craft.amount_eur;
  end loop;

  insert into public.sim_journal_lines
   (organization_id,journal_id,account_id,side,amount_eur,description)
  values(org.id,j_id,liability_id,'credit',amount_total,
    'Nur Simulation: fiktive aufgelaufene Flottenkosten');

  insert into public.audit_events
   (organization_id,actor_role,event_type,resource_type,resource_id,details)
  values(org.id,'simulation_worker','sim_finance_journal_posted','sim_journals',j_id,
   jsonb_build_object('day',p_day,'type','fictional_daily_fleet_holding',
      'amount_eur',amount_total,'cash_movement',false));
  n:=n+1;
 end loop;
 return n;
end $run$;
revoke all on function ops_internal.simulate_fleet_holding_day(date) from public,anon,authenticated;
comment on function ops_internal.simulate_fleet_holding_day(date) is
 'Creates balanced, fictional non-cash daily fleet holding journal entries. Not real accounts.';

select cron.schedule('aervelys-ops5-fictional-fleet-ledger-daily','35 5 * * *',
 'select ops_internal.simulate_fleet_holding_day((now() at time zone ''UTC'')::date);');
