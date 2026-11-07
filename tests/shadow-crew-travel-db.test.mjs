import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261107183000_ops5_shadow_crew_travel_options.sql',import.meta.url),'utf8');
const action=readFileSync(new URL('../app/crew-travel/actions.ts',import.meta.url),'utf8');

test('fictional travel catalog is owner-scoped, immutable and not anonymous',()=>{
 assert.match(sql,/create table public\.shadow_crew_travel_options/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.shadow_crew_travel_options from public,anon,authenticated/);
 assert.match(sql,/grant select,insert on public\.shadow_crew_travel_options to authenticated/);
 assert.match(sql,/shadow_crew_travel_owner_read/);
 assert.match(sql,/shadow_crew_travel_owner_insert/);
 assert.match(sql,/created_by_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/o\.owner_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/shadow_crew_travel_immutable/);
 assert.doesNotMatch(sql,/grant (update|delete) on public\.shadow_crew_travel_options/i);
});
test('route action cannot write a ticket, flight, duty block or crew position',()=>{
 assert.match(action,/requireWorkspace\(\)/);
 assert.match(action,/shadow_crew_travel_options/);
 assert.match(action,/created_by_user_id:user\.id/);
 assert.match(action,/simulation_only:true/);
 assert.doesNotMatch(action,/service_role|SERVICE_ROLE|createServiceClient/);
 assert.doesNotMatch(action,/crew_location_events|shadow_crew_assignments|flight_plans|crew_duty_blocks/);
});
