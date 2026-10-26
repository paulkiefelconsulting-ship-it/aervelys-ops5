import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const a=read('supabase/migrations/20261026174140_ops5_shadow_maintenance_foundation.sql');
const b=read('supabase/migrations/20261026174232_ops5_shadow_maintenance_dispatch_gates.sql');

test('owner-only fictional maintenance state and immutable history',()=>{
 assert.match(a,/shadow_maintenance_states/);
 assert.match(a,/shadow_maintenance_events/);
 assert.match(a,/enable row level security/);
 assert.match(a,/grant select on public.%I to authenticated/);
 assert.match(a,/shadow_maintenance_events_immutable/);
 assert.match(a,/simulation_only boolean not null default true check\(simulation_only\)/);
});
test('fictional grounding and servicing are tied to model flight hours',()=>{
 assert.match(a,/advance_shadow_maintenance/);
 assert.match(a,/accumulated_hypothetical_hours>=item.due_at_hours/);
 assert.match(a,/scheduled_release_at<=p_at/);
 assert.match(a,/service_count=service_count\+1/);
 assert.match(a,/shadow_maintenance_can_fly/);
 assert.match(a,/s.accumulated_hypothetical_hours\+p_hours<=m.due_at_hours/);
});
test('both charter and positioning departures obey maintenance limits',()=>{
 assert.match(b,/blocked_maintenance/);
 assert.match(b,/shadow_maintenance_can_fly\(f.aircraft_id,f.assumed_block_hours\)/);
 assert.match(b,/shadow_maintenance_can_fly\(flight.aircraft_id,duration_hours\)/);
 assert.match(b,/shadow_maintenance_can_fly\(leg.aircraft_id,leg.assumed_block_hours\)/);
 assert.match(b,/perform ops_internal.advance_shadow_maintenance\(p_at\)/);
});
test('maintenance is isolated from actual operations and payments',()=>{
 assert.doesNotMatch(a+b,/update public\.aircraft|insert into public\.flight_plans|insert into public\.sim_journals|net\.http_post/);
 assert.match(a,/revoke all on function ops_internal.advance_shadow_maintenance\(timestamptz\)/);
});
test('new read-only maintenance screen is tenant scoped',()=>{
 const ui=read('app/maintenance/page.tsx');
 assert.match(ui,/requireWorkspace\(\)/);
 assert.match(ui,/\.eq\('organization_id',organization\.id\)/);
 assert.doesNotMatch(ui,/service_role|ops_private|monthly_gross_sim/);
});
