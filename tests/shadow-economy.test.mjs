import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261026164029_ops5_shadow_completion_double_entry_accounting.sql');

test('posting only processes completed fictional flight and ferry outcomes',()=>{
 assert.match(sql,/f.status='completed'/);
 assert.match(sql,/o.model_revenue_eur>0 and o.model_cost_eur>0/);
 assert.match(sql,/lp.status='completed'/);
 assert.match(sql,/lp.arrived_at is not null and lp.fictional_cost_eur>0/);
});
test('each completed source is linked, org-safe, and booked at most once',()=>{
 assert.match(sql,/sim_journals_source_ref_check/);
 assert.match(sql,/sim_journals_shadow_outcome_org_fk/);
 assert.match(sql,/sim_journals_positioning_leg_org_fk/);
 assert.match(sql,/sim_journals_shadow_outcome_unique/);
 assert.match(sql,/sim_journals_shadow_positioning_unique/);
});
test('double entry posting is restricted, bounded, idempotent and non-cash',()=>{
 assert.match(sql,/on conflict do nothing returning id into j/);
 assert.match(sql,/p_limit<1 or p_limit>200/);
 assert.match(sql,/shadow_charters_posted/);
 assert.match(sql,/shadow_positionings_posted/);
 assert.match(sql,/'cash_movement',false/);
 assert.match(sql,/revoke all on function ops_internal.post_completed_shadow_economy\(integer\)/);
 assert.doesNotMatch(sql,/insert into public\.simulation_accounts|update public\.aircraft|insert into public\.flight_plans/);
});
test('hourly processing and existing daily holding job coexist',()=>{
 assert.match(sql,/aervelys-ops5-shadow-economy-hourly','10 \* \* \* \*'/);
 assert.match(sql,/simulate_fleet_holding_day\(date\)/);
 assert.match(sql,/sim_journals_fleet_day_unique/);
});
test('finance and economics screens enforce workspace and organization',()=>{
 for(const file of ['app/economics/page.tsx','app/finance-ledger/page.tsx']){
  const page=read(file);
  assert.match(page,/requireWorkspace\(\)/);
  assert.match(page,/\.eq\('organization_id',organization\.id\)/);
  assert.doesNotMatch(page,/service_role|ops_private|monthly_gross_sim/);
 }
});
