import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('supabase/migrations/20261026091350_ops5_virtual_positioning_schema.sql');
const engine=read('supabase/migrations/20261026091453_ops5_virtual_positioning_engine.sql');
test('positioning mission integrity keeps aircraft state mutually exclusive',()=>{
 assert.match(schema,/shadow_states_exclusive_active/);
 assert.match(schema,/phase='positioning' and active_shadow_flight_id is null/);
 assert.match(schema,/foreign key\(shadow_flight_id,organization_id\)/);
 assert.match(schema,/shadow_positioning_active_aircraft_idx/);
});
test('positioning worker uses next virtual flight and blocks unmapped, rushed, conflicting legs',()=>{
 assert.match(engine,/distinct on \(f\.aircraft_id\)/);
 assert.match(engine,/blocked_route/);
 assert.match(engine,/blocked_time/);
 assert.match(engine,/blocked_busy/);
 assert.match(engine,/tstzrange\(other\.departure_at,other\.arrival_at/);
 assert.match(engine,/perform ops_internal.advance_shadow_positioning\(p_at\)/);
});
test('positioning phases accrue hours without operating the real fleet',()=>{
 assert.match(engine,/status='enroute'/);
 assert.match(engine,/status='completed'/);
 assert.match(engine,/accumulated_hypothetical_hours=accumulated_hypothetical_hours\+leg.assumed_block_hours/);
 assert.doesNotMatch(engine,/update public\.aircraft|insert into public\.sim_journal_lines|insert into public\.flight_plans/);
});
test('authenticated clients cannot write positioning records or call worker functions',()=>{
 assert.match(schema,/alter table public.%I enable row level security/);
 assert.match(schema,/grant select on public.%I to authenticated/);
 assert.match(engine,/revoke all on function ops_internal\.advance_shadow_positioning\(timestamptz\)/);
 const page=read('app/positioning/page.tsx');
 assert.match(page,/requireWorkspace\(\)/);
 assert.match(page,/\.eq\('organization_id',organization\.id\)/);
});
