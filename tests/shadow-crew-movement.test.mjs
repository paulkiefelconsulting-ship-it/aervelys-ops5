import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261107140000_ops5_shadow_crew_movement.sql',import.meta.url),'utf8');
const action=readFileSync(new URL('../app/shadow-crew/actions.ts',import.meta.url),'utf8');

test('shadow crew tables are completely separate from operational crew-location history',()=>{
 assert.match(migration,/create table public\.shadow_crew_assignments\s*\(/);
 assert.match(migration,/create table public\.shadow_crew_movements\s*\(/);
 assert.doesNotMatch(migration,/insert into public\.crew_location_events/i);
 assert.doesNotMatch(migration,/update public\.employees/i);
 assert.doesNotMatch(migration,/update public\.aircraft/i);
 assert.match(migration,/check\s*\(simulation_only\)/);
});
test('flight and ferry events only originate from completed shadow movements',()=>{
 assert.match(migration,/after insert on public\.shadow_flight_outcomes/i);
 assert.match(migration,/after update of status on public\.shadow_positioning_legs/i);
 assert.match(migration,/new\.status<>'completed'/i);
 assert.match(migration,/v_flight\.status<>'completed'/i);
 assert.match(migration,/assigned_at>v_depart/i);
 assert.match(migration,/blocked_no_location/);
 assert.match(migration,/blocked_wrong_airport/);
 assert.match(migration,/blocked_stale_location/);
 assert.match(migration,/blocked_time_window/);
});
test('every shadow movement is immutable, idempotent and protected by owner RLS',()=>{
 assert.match(migration,/shadow_crew_movements_owner_read/);
 assert.match(migration,/shadow_crew_assignments_owner_create/);
 assert.match(migration,/shadow_crew_assignments_immutable/);
 assert.match(migration,/shadow_crew_movements_immutable/);
 assert.match(migration,/unique\(organization_id,source_kind,source_id,employee_id\)/i);
 assert.match(migration,/on conflict \(organization_id,source_kind,source_id,employee_id\) do nothing/i);
 assert.match(migration,/from public, anon, authenticated/);
 assert.doesNotMatch(migration,/grant .*\b(?:update|delete)\b.* to authenticated/i);
});
test('owner assignment blocks overlapping crew scenarios',()=>{
 assert.match(migration,/for update;/i);
 assert.match(migration,/tstzrange\(other\.departure_at/i);
 assert.match(migration,/already assigned to overlapping synthetic flight/i);
 assert.match(migration,/e\.crew_role=public\.shadow_crew_assignments\.crew_role/);
});
test('server action never authorizes real flights or writes scenario outcomes',()=>{
 assert.match(action,/requireWorkspace\(\)/);
 assert.match(action,/shadow_flights/);
 assert.match(action,/shadow_crew_assignments/);
 assert.match(action,/assigned_by_user_id:user\.id/);
 assert.match(action,/flight\.status!=='planned'/);
 assert.doesNotMatch(action,/service_role|SERVICE_ROLE|createServiceClient/);
 assert.doesNotMatch(action,/crew_location_events|shadow_flight_outcomes|flight_plans.*insert/);
});
