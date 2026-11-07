import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const init=readFileSync(new URL('../supabase/migrations/20261105183500_ops5_crew_location_evidence_ledger.sql',import.meta.url),'utf8');
const allow=readFileSync(new URL('../supabase/migrations/20261107113000_ops5_crew_location_owner_initial_checkin.sql',import.meta.url),'utf8');
const action=readFileSync(new URL('../app/crew-locations/actions.ts',import.meta.url),'utf8');

test('crew location ledger has owner-only reading and append-only history',()=>{
 assert.match(init,/alter table public\.crew_location_events enable row level security/i);
 assert.match(init,/crew_location_events_owner_read/i);
 assert.match(init,/before update or delete on public\.crew_location_events/i);
 assert.doesNotMatch(init,/grant .*delete.* to authenticated/i);
 assert.doesNotMatch(init,/grant .*update.* to authenticated/i);
});
test('initial owner insert policy permits only evidenced check-in, no other move',()=>{
 assert.match(allow,/create policy crew_location_owner_initial_checkin/i);
 assert.match(allow,/for insert to authenticated/i);
 assert.match(allow,/recorded_by_user_id = \(select auth\.uid\(\)\)/i);
 assert.match(allow,/event_type = 'check_in'/i);
 assert.match(allow,/source_reference = 'owner_manual_initial_checkin'/i);
 assert.match(allow,/crew_role in \('PIC','SIC'\)/i);
 assert.match(allow,/create unique index crew_location_one_verified_initial_checkin/i);
 assert.doesNotMatch(allow,/grant (?:update|delete) on/i);
});
test('server action checks owner and employee, never issues a flight release',()=>{
 assert.match(action,/requireWorkspace\(\)/);
 assert.match(action,/crew_role/);
 assert.match(action,/recorded_by_user_id:user\.id/);
 assert.match(action,/verification_state:'verified'/);
 assert.match(action,/event_type:'check_in'/);
 assert.doesNotMatch(action,/service_role|SERVICE_ROLE|createServiceClient/);
 assert.doesNotMatch(action,/operational_lock|release_aircraft|flight_plans.*insert/);
});
