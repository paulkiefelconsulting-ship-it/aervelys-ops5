import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261026083642_ops5_shadow_flight_lifecycle.sql');
const fix=read('supabase/migrations/20261026083739_ops5_shadow_flight_fix_seed_alias.sql');

test('shadow flights are only derived from explicitly synthetic charter leads',()=>{
 assert.match(schema,/where cr\.origin='simulation' and cr\.status='draft'/);
 assert.match(schema,/ca\.assumed_block_hours is not null/);
 assert.match(schema,/unique\(organization_id,charter_request_id\)/);
 assert.match(schema,/on conflict\(organization_id,charter_request_id\) do nothing/);
});
test('flight phases are separate from the operational fleet, with positioning and occupancy blockers',()=>{
 assert.match(schema,/planned','in_air','completed','blocked_positioning','blocked_busy/);
 assert.match(schema,/hypothetical_location_icao/);
 assert.match(schema,/st\.phase='in_air'/);
 assert.match(schema,/st\.hypothetical_location_icao<>f\.departure_icao/);
 assert.match(schema,/accumulated_hypothetical_hours=accumulated_hypothetical_hours\+f\.assumed_block_hours/);
 assert.doesNotMatch(schema,/update public\.aircraft|insert into public\.flight_plans|insert into public\.resource_reservations/);
 assert.match(fix,/seed\.home_base_icao/);
});
test('shadow flight financial outcomes are not actual ledger transactions',()=>{
 assert.match(schema,/create table public\.shadow_flight_outcomes/);
 assert.match(schema,/Counterfactual flight result; NOT realized revenue/);
 assert.doesNotMatch(schema,/insert into public\.sim_journals|insert into public\.sim_journal_lines|insert into public\.simulation_accounts/);
});
test('RLS keeps events, outcomes and virtual states owner read-only',()=>{
 assert.match(schema,/alter table public.%I enable row level security/);
 assert.match(schema,/grant select on public.%I to authenticated/);
 assert.match(schema,/revoke all on public.%I from public,anon,authenticated/);
 assert.match(schema,/revoke all on function ops_internal\.advance_shadow_flights\(timestamptz\)/);
});
test('server-side hourly workflow and authenticated UI',()=>{
 assert.match(schema,/cron\.schedule\(/);
 assert.match(schema,/aervelys-ops5-shadow-flight-hourly/);
 assert.match(schema,/'0 \* \* \* \*'/);
 const page=read('app/flight-simulator/page.tsx');
 assert.match(page,/requireWorkspace\(\)/);
 assert.match(page,/\.eq\('organization_id',organization\.id\)/);
 assert.match(page,/Keine operative Flugfreigabe/);
 assert.doesNotMatch(page,/ops_private|service_role|monthly_gross_sim/);
});
