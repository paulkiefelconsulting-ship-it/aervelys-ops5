import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261026170204_ops5_virtual_treasury_schema.sql');
const worker=read('supabase/migrations/20261026170337_ops5_virtual_treasury_worker.sql');

test('Treasury is a separately protected simulation with immutable movements',()=>{
 for(const table of ['shadow_treasury_accounts','shadow_treasury_movements']){
  assert.match(schema,new RegExp("'"+table+"'"));
 }
 assert.match(schema,/enable row level security/);
 assert.match(schema,/grant select on public.%I to authenticated/);
 assert.match(schema,/shadow_treasury_movements_append_only/);
 assert.match(schema,/balance_eur numeric\(16,2\) not null default 0 check\(balance_eur>=0\)/);
 assert.match(schema,/simulation_only boolean not null default true check\(simulation_only\)/);
});

test('Settlement sources and journal entries use org-scoped foreign keys and uniqueness',()=>{
 assert.match(schema,/foreign key\(source_journal_id,organization_id\)/);
 assert.match(schema,/foreign key\(treasury_account_id,organization_id\)/);
 assert.match(schema,/sim_journals_treasury_movement_fk/);
 assert.match(schema,/sim_journals_treasury_movement_unique/);
 assert.match(schema,/shadow_treasury_one_settlement_idx/);
 assert.match(schema,/shadow_treasury_single_opening_idx/);
});

test('One-time fictional capital is transparently sourced and journalled',()=>{
 assert.match(worker,/v_amount:=250000.00/);
 assert.match(worker,/fictional_opening_capital/);
 assert.match(worker,/SHADOW_OPENING_EQUITY/);
 assert.match(worker,/cash_gl,'debit',v_amount/);
 assert.match(worker,/equity_gl,'credit',v_amount/);
});

test('Receipts require posted shadow charter revenue, payments require recorded model liabilities',()=>{
 assert.match(worker,/j.source_kind='shadow_charter_completion'/);
 assert.match(worker,/a.code='SHADOW_CHARTER_REVENUE' and l.side='credit'/);
 assert.match(worker,/ACCRUED_SIM_LIABILITY' and l.side='credit'/);
 assert.match(worker,/fictional_daily_fleet_holding','shadow_charter_completion','shadow_positioning_completion/);
 assert.match(worker,/v_balance<v_amount then/);
 assert.match(worker,/balance_eur>=v_amount/);
});

test('Worker has no real payment endpoints, is bounded and runs hourly after economy',()=>{
 assert.match(worker,/p_limit<1 or p_limit>200/);
 assert.match(worker,/aervelys-ops5-shadow-treasury-hourly','20 \* \* \* \*'/);
 assert.match(worker,/revoke all on function ops_internal.advance_shadow_treasury\(integer\)/);
 assert.doesNotMatch(worker,/http_post|net\.http|stripe|bank\.transfer|IBAN|create_payment_intent/i);
});

test('Treasury and ledger UI demand authenticated organization scoped access',()=>{
 for(const file of ['app/treasury/page.tsx','app/finance-ledger/page.tsx']){
  const page=read(file);
  assert.match(page,/requireWorkspace\(\)/);
  assert.match(page,/\.eq\('organization_id',organization\.id\)/);
  assert.doesNotMatch(page,/service_role|ops_private|monthly_gross_sim/);
 }
});
