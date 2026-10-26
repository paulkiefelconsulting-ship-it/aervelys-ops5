-- OPS 5.0 virtual treasury: absolutely no banking provider, IBAN, payouts or real payment instruction.
-- This is a separate internal simulation, with explicit fictional opening capital.
create table public.shadow_treasury_accounts(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null unique references public.organizations(id),
 display_name text not null default 'AERVELYS virtueller EUR-Bestand',
 currency text not null default 'EUR' check(currency='EUR'),
 balance_eur numeric(16,2) not null default 0 check(balance_eur>=0),
 simulation_only boolean not null default true check(simulation_only),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,organization_id)
);
create table public.shadow_treasury_movements(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 treasury_account_id uuid not null,
 source_journal_id uuid,
 kind text not null check(kind in ('fictional_opening_capital','fictional_charter_receipt','fictional_cost_payment')),
 direction text not null check(direction in ('in','out')),
 amount_eur numeric(14,2) not null check(amount_eur>0),
 balance_after_eur numeric(16,2) not null check(balance_after_eur>=0),
 description text not null,
 simulation_only boolean not null default true check(simulation_only),
 created_at timestamptz not null default now(),
 unique(id,organization_id),
 foreign key(treasury_account_id,organization_id) references public.shadow_treasury_accounts(id,organization_id),
 foreign key(source_journal_id,organization_id) references public.sim_journals(id,organization_id),
 constraint shadow_treasury_movement_semantics check(
  (kind='fictional_opening_capital' and direction='in' and source_journal_id is null)
  or (kind='fictional_charter_receipt' and direction='in' and source_journal_id is not null)
  or (kind='fictional_cost_payment' and direction='out' and source_journal_id is not null)
 )
);
create unique index shadow_treasury_single_opening_idx
 on public.shadow_treasury_movements(organization_id) where kind='fictional_opening_capital';
create unique index shadow_treasury_one_settlement_idx
 on public.shadow_treasury_movements(organization_id,source_journal_id,kind)
 where source_journal_id is not null;
create index shadow_treasury_org_recent_idx on public.shadow_treasury_movements(organization_id,created_at desc);

do $access$
declare table_name text;
begin
 foreach table_name in array array['shadow_treasury_accounts','shadow_treasury_movements']
 loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);
  execute format('grant select on public.%I to authenticated',table_name);
  execute format('create policy %I on public.%I for select to authenticated
    using(exists(select 1 from public.organizations o where o.id=organization_id
      and o.owner_user_id=(select auth.uid())))',
    table_name||'_owner_read',table_name);
 end loop;
end $access$;

create trigger shadow_treasury_movements_append_only
 before update or delete on public.shadow_treasury_movements
 for each row execute function ops_internal.prevent_sim_ledger_mutation();
create or replace function ops_internal.block_treasury_account_delete()
 returns trigger language plpgsql security invoker set search_path=pg_catalog as $deny$
begin
 raise exception 'Virtual treasury account may not be deleted or reassigned';
end $deny$;
revoke all on function ops_internal.block_treasury_account_delete() from public,anon,authenticated;
create trigger shadow_treasury_accounts_no_delete
 before delete on public.shadow_treasury_accounts
 for each row execute function ops_internal.block_treasury_account_delete();
create or replace function ops_internal.prevent_treasury_identity_change()
 returns trigger language plpgsql security invoker set search_path=pg_catalog as $check$
begin
 if new.organization_id is distinct from old.organization_id
   or new.currency is distinct from old.currency
   or new.simulation_only is distinct from old.simulation_only
   or new.id is distinct from old.id
   or new.display_name is distinct from old.display_name then
  raise exception 'Virtual treasury identity is immutable';end if;
 return new;
end $check$;
revoke all on function ops_internal.prevent_treasury_identity_change() from public,anon,authenticated;
create trigger shadow_treasury_accounts_identity_guard
 before update on public.shadow_treasury_accounts
 for each row execute function ops_internal.prevent_treasury_identity_change();

-- Corresponding general-ledger entries are also balanced and append-only.
alter table public.sim_ledger_accounts drop constraint sim_ledger_accounts_code_check;
alter table public.sim_ledger_accounts add constraint sim_ledger_accounts_code_check
 check(code in (
 'FLEET_HOLDING_EXPENSE','ACCRUED_SIM_LIABILITY',
 'SHADOW_SCENARIO_RECEIVABLE','SHADOW_CHARTER_REVENUE',
 'SHADOW_CHARTER_EXPENSE','SHADOW_POSITIONING_EXPENSE',
 'SHADOW_TREASURY_CASH','SHADOW_OPENING_EQUITY'));
alter table public.sim_ledger_accounts drop constraint sim_ledger_accounts_class_check;
alter table public.sim_ledger_accounts add constraint sim_ledger_accounts_class_check
 check(class in ('expense','liability','asset','revenue','equity'));

alter table public.sim_journals add column treasury_movement_id uuid;
alter table public.sim_journals add constraint sim_journals_treasury_movement_fk
 foreign key(treasury_movement_id,organization_id)
 references public.shadow_treasury_movements(id,organization_id);
alter table public.sim_journals drop constraint sim_journals_source_kind_check;
alter table public.sim_journals add constraint sim_journals_source_kind_check
 check(source_kind in (
 'fictional_daily_fleet_holding','shadow_charter_completion','shadow_positioning_completion',
 'shadow_treasury_opening','shadow_treasury_receipt','shadow_treasury_payment'));
alter table public.sim_journals drop constraint sim_journals_source_ref_check;
alter table public.sim_journals add constraint sim_journals_source_ref_check
 check(
 (source_kind='fictional_daily_fleet_holding'
   and shadow_outcome_id is null and positioning_leg_id is null and treasury_movement_id is null)
 or (source_kind='shadow_charter_completion'
   and shadow_outcome_id is not null and positioning_leg_id is null and treasury_movement_id is null)
 or (source_kind='shadow_positioning_completion'
   and shadow_outcome_id is null and positioning_leg_id is not null and treasury_movement_id is null)
 or (source_kind in ('shadow_treasury_opening','shadow_treasury_receipt','shadow_treasury_payment')
   and shadow_outcome_id is null and positioning_leg_id is null and treasury_movement_id is not null)
 );
create unique index sim_journals_treasury_movement_unique
 on public.sim_journals(organization_id,treasury_movement_id)
 where treasury_movement_id is not null;
