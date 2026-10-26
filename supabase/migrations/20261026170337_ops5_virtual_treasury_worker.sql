-- Hourly autonomous, internally funded fictional treasury; no external payment API.
create or replace function ops_internal.advance_shadow_treasury(p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $body$
declare
 org record;src record;
 account_id uuid;cash_gl uuid; equity_gl uuid; receivable_gl uuid; payable_gl uuid;
 v_balance numeric(16,2);new_balance numeric(16,2);v_amount numeric(14,2);
 move_id uuid;ledger_id uuid;
 new_openings integer:=0;receipts integer:=0;payments integer:=0;unfunded integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>200 then
  raise exception 'Treasury limit must be in 1..200';end if;
 perform pg_advisory_xact_lock(505,9445);

 for org in select id from public.organizations order by id loop
  insert into public.shadow_treasury_accounts(organization_id)
    values(org.id) on conflict(organization_id) do nothing;
  select id,balance_eur into strict account_id,v_balance
   from public.shadow_treasury_accounts where organization_id=org.id for update;

  insert into public.sim_ledger_accounts(organization_id,code,title,class)
   values(org.id,'SHADOW_TREASURY_CASH','Fiktiver Treasury-Bestand','asset'),
         (org.id,'SHADOW_OPENING_EQUITY','Fiktives Startkapital','equity'),
         (org.id,'SHADOW_SCENARIO_RECEIVABLE','Rein fiktive Charter-Forderung','asset'),
         (org.id,'ACCRUED_SIM_LIABILITY','Fiktive offene Kosten','liability')
   on conflict(organization_id,code) do nothing;

  select id into strict cash_gl from public.sim_ledger_accounts
    where organization_id=org.id and code='SHADOW_TREASURY_CASH';
  select id into strict equity_gl from public.sim_ledger_accounts
    where organization_id=org.id and code='SHADOW_OPENING_EQUITY';
  select id into strict receivable_gl from public.sim_ledger_accounts
    where organization_id=org.id and code='SHADOW_SCENARIO_RECEIVABLE';
  select id into strict payable_gl from public.sim_ledger_accounts
    where organization_id=org.id and code='ACCRUED_SIM_LIABILITY';

  -- Single fictitious opening: a visible scenario assumption, not a deposit.
  if not exists(select 1 from public.shadow_treasury_movements m
    where m.organization_id=org.id and m.kind='fictional_opening_capital') then
   if v_balance<>0 then raise exception 'Nonzero opening without source movement';end if;
   v_amount:=250000.00;
   update public.shadow_treasury_accounts
     set balance_eur=balance_eur+v_amount,updated_at=now()
     where id=account_id returning balance_eur into strict v_balance;
   insert into public.shadow_treasury_movements(
     organization_id,treasury_account_id,kind,direction,amount_eur,
     balance_after_eur,description)
    values(org.id,account_id,'fictional_opening_capital','in',v_amount,
     v_balance,'Ausdrücklich erfundenes Startkapital: keine Bankeinzahlung')
    returning id into move_id;
   insert into public.sim_journals(
     organization_id,source_kind,source_day,treasury_movement_id,description)
    values(org.id,'shadow_treasury_opening',(now() at time zone 'UTC')::date,
      move_id,'Simulationsstartkapital – keine reale Finanzierung')
    returning id into ledger_id;
   insert into public.sim_journal_lines(
     organization_id,journal_id,account_id,side,amount_eur,description)
    values
     (org.id,ledger_id,cash_gl,'debit',v_amount,'Fiktives Kapital im virtuellen Bestand'),
     (org.id,ledger_id,equity_gl,'credit',v_amount,'Fiktives Start-Eigenkapital');
   new_openings:=new_openings+1;
  end if;

  -- Receipts only for ledger-booked COMPLETED shadow charter revenues.
  for src in
   select j.id as source_id,
     (select sum(l.amount_eur)
      from public.sim_journal_lines l
      join public.sim_ledger_accounts a on a.id=l.account_id and a.organization_id=l.organization_id
      where l.journal_id=j.id and l.organization_id=j.organization_id
       and a.code='SHADOW_CHARTER_REVENUE' and l.side='credit') as amount
   from public.sim_journals j
   where j.organization_id=org.id and j.source_kind='shadow_charter_completion'
    and j.status='posted'
    and not exists(select 1 from public.shadow_treasury_movements m
     where m.organization_id=j.organization_id and m.source_journal_id=j.id
       and m.kind='fictional_charter_receipt')
   order by j.posted_at,j.id limit p_limit
  loop
   v_amount:=src.amount;
   if v_amount is null or v_amount<=0 then
     raise exception 'Invalid fictional revenue source journal %',src.source_id;end if;
   update public.shadow_treasury_accounts
    set balance_eur=balance_eur+v_amount,updated_at=now()
    where id=account_id returning balance_eur into strict v_balance;
   insert into public.shadow_treasury_movements(
     organization_id,treasury_account_id,source_journal_id,kind,direction,
     amount_eur,balance_after_eur,description)
   values(org.id,account_id,src.source_id,'fictional_charter_receipt','in',
    v_amount,v_balance,'Fiktiver Kundenzahlungseingang – kein realer Kunde')
   returning id into move_id;
   insert into public.sim_journals(
      organization_id,source_kind,source_day,treasury_movement_id,description)
   values(org.id,'shadow_treasury_receipt',(now() at time zone 'UTC')::date,
    move_id,'Nur virtueller Forderungsausgleich')
   returning id into ledger_id;
   insert into public.sim_journal_lines(
      organization_id,journal_id,account_id,side,amount_eur,description)
    values(org.id,ledger_id,cash_gl,'debit',v_amount,'Virtueller Zahlungsmittelzufluss'),
      (org.id,ledger_id,receivable_gl,'credit',v_amount,'Virtueller Forderungsausgleich');
   receipts:=receipts+1;
  end loop;

  -- Pay only recorded model liabilities. Never overdraw the fictional balance.
  for src in
   select j.id as source_id,
    (select sum(l.amount_eur)
     from public.sim_journal_lines l
     join public.sim_ledger_accounts a on a.id=l.account_id and a.organization_id=l.organization_id
     where l.journal_id=j.id and l.organization_id=j.organization_id
       and a.code='ACCRUED_SIM_LIABILITY' and l.side='credit') as amount
   from public.sim_journals j
   where j.organization_id=org.id
    and j.source_kind in (
     'fictional_daily_fleet_holding','shadow_charter_completion','shadow_positioning_completion')
    and j.status='posted'
    and not exists(select 1 from public.shadow_treasury_movements m
     where m.organization_id=j.organization_id and m.source_journal_id=j.id
       and m.kind='fictional_cost_payment')
   order by j.posted_at,j.id limit p_limit
  loop
   v_amount:=src.amount;
   if v_amount is null or v_amount<=0 then
    raise exception 'Invalid fictional liability source journal %',src.source_id;end if;
   if v_balance<v_amount then
    unfunded:=unfunded+1;continue;end if;
   update public.shadow_treasury_accounts
    set balance_eur=balance_eur-v_amount,updated_at=now()
    where id=account_id and balance_eur>=v_amount
    returning balance_eur into strict v_balance;
   insert into public.shadow_treasury_movements(
     organization_id,treasury_account_id,source_journal_id,kind,direction,
     amount_eur,balance_after_eur,description)
   values(org.id,account_id,src.source_id,'fictional_cost_payment','out',
    v_amount,v_balance,'Fiktive Kostenbegleichung – keine reale Überweisung')
    returning id into move_id;
   insert into public.sim_journals(
     organization_id,source_kind,source_day,treasury_movement_id,description)
   values(org.id,'shadow_treasury_payment',(now() at time zone 'UTC')::date,
    move_id,'Nur virtuelle Verbindlichkeitsbegleichung')
   returning id into ledger_id;
   insert into public.sim_journal_lines(
     organization_id,journal_id,account_id,side,amount_eur,description)
   values(org.id,ledger_id,payable_gl,'debit',v_amount,'Virtueller Verbindlichkeitsausgleich'),
    (org.id,ledger_id,cash_gl,'credit',v_amount,'Virtueller Zahlungsmittelabfluss');
   payments:=payments+1;
  end loop;
 end loop;

 return jsonb_build_object(
  'fictional_openings',new_openings,'fictional_receipts',receipts,
  'fictional_payments',payments,'unfunded_model_payments',unfunded,
  'simulation_only',true,'external_transfers',false);
end $body$;
revoke all on function ops_internal.advance_shadow_treasury(integer)
 from public,anon,authenticated;
comment on function ops_internal.advance_shadow_treasury(integer) is
 'Strictly fictional treasury settlement and GL balancing; no integrations, no payouts.';

select cron.schedule('aervelys-ops5-shadow-treasury-hourly','20 * * * *',
 'select ops_internal.advance_shadow_treasury(100);');
