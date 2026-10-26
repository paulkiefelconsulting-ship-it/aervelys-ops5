import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261026002158_ops5_shadow_market_autonomous_daily.sql');

test('daily autonomous simulator is scheduled and idempotent',()=>{
 assert.match(schema,/cron\.schedule\('aervelys-ops5-shadow-market-daily','15 5 \* \* \*'/);
 assert.match(schema,/unique\(organization_id,simulation_day\)/);
 assert.match(schema,/on conflict \(organization_id,simulation_day\) do nothing/);
});

test('simulated requests are drafts, never a flight or payment',()=>{
 assert.match(schema,/insert into public\.charter_requests/);
 assert.match(schema,/'draft','simulation'/);
 assert.match(schema,/No aircraft is operationally available/);
 assert.doesNotMatch(schema,/insert into public\.flight_plans|insert into public\.resource_reservations|insert into public\.finance_drafts/);
});

test('RLS and privileges restrict automation control and read access',()=>{
 assert.match(schema,/alter table public\.simulation_market_ticks enable row level security/);
 assert.match(schema,/simulation_ticks_owner_read/);
 assert.match(schema,/origin='manual'/);
 assert.match(schema,/revoke all on function ops_internal\.simulate_market_day\(date\) from public,anon,authenticated/);
});

test('dashboard is authenticated and accurately names its implementation phase',()=>{
 const page=read('app/simulation/page.tsx');
 assert.match(page,/requireWorkspace\(\)/);
 assert.match(page,/regelbasiert, keine generative KI/);
 assert.match(page,/Noch nicht eingebaut/);
});
