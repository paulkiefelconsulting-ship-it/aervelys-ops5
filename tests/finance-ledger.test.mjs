import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261026082439_ops5_fictional_double_entry_ledger.sql');

test('fictional ledgers have deferred double entry integrity and journal immutability',()=>{
 assert.match(schema,/assert_sim_journal_balanced/);
 assert.match(schema,/deferrable initially deferred/);
 assert.match(schema,/debit_total<>credit_total/);
 assert.match(schema,/sim_journals_no_mutation before update or delete/);
 assert.match(schema,/sim_journal_lines_no_mutation before update or delete/);
});

test('no bank transfers, no revenue on unflown charter leads',()=>{
 assert.match(schema,/fictional_daily_fleet_holding/);
 assert.match(schema,/No customer payments, banking integration/);
 assert.doesNotMatch(schema,/insert into public\.simulation_accounts|insert into public\.finance_drafts|insert into public\.flight_plans/);
 assert.match(schema,/simulation_only boolean not null default true check\(simulation_only\)/);
});

test('one cron run per day, idempotent journals and locked backend execution',()=>{
 assert.match(schema,/cron\.schedule\('aervelys-ops5-fictional-fleet-ledger-daily','35 5 \* \* \*'/);
 assert.match(schema,/unique\(organization_id,source_kind,source_day\)/);
 assert.match(schema,/on conflict\(organization_id,source_kind,source_day\) do nothing/);
 assert.match(schema,/revoke all on function ops_internal\.simulate_fleet_holding_day\(date\) from public,anon,authenticated/);
});

test('owner-scoped read-only schema includes organization foreign keys',()=>{
 assert.match(schema,/alter table public.%I enable row level security/);
 assert.match(schema,/grant select on public.%I to authenticated/);
 assert.match(schema,/foreign key\(journal_id,organization_id\)/);
 assert.match(schema,/foreign key\(account_id,organization_id\)/);
 assert.match(schema,/foreign key\(aircraft_id,organization_id\)/);
});

test('finance page checks authenticated workspace and never exposes bank write actions',()=>{
 const page=read('app/finance-ledger/page.tsx');
 assert.match(page,/requireWorkspace\(\)/);
 assert.match(page,/\.eq\('organization_id',organization\.id\)/);
 assert.match(page,/Kein Zahlungsverkehr/);
 assert.doesNotMatch(page,/service_role|transaction\.insert|balance\.update/);
});
