import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261108071000_ops5_shadow_crew_transfer_lifecycle.sql',import.meta.url),'utf8');
const action=readFileSync(new URL('../app/crew-travel/schedule-transfer.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/crew-travel/page.tsx',import.meta.url),'utf8');

test('ground positioning extends shadow movement provenance, never real crew location ledger',()=>{
 assert.match(sql,/shadow_crew_movements_source_kind_check/);
 assert.match(sql,/\('charter','ferry','ground'\)/);
 assert.match(sql,/INSERT INTO public\.shadow_crew_movements/);
 assert.match(sql,/source_kind,source_id/);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.crew_location_events/i);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.flight_plans/i);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.aircraft/i);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.employees/i);
});
test('owner-scoped read and insert with no direct client mutation or ledger expense posts',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/shadow_crew_transfer_owner_insert/);
 assert.match(sql,/created_by_user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/o\.owner_user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/GRANT INSERT ON public\.shadow_crew_transfer_orders TO authenticated/);
 assert.doesNotMatch(sql,/GRANT (?:UPDATE|DELETE) ON public\.shadow_crew_transfer_orders TO authenticated/i);
 assert.doesNotMatch(sql,/GRANT INSERT ON public\.shadow_crew_travel_expenses TO authenticated/i);
 assert.match(sql,/shadow_crew_transfer_events_immutable/);
 assert.match(sql,/shadow_crew_expenses_immutable/);
});
test('all route options and ticket costs are revalidated in SQL, not trusted from form',()=>{
 assert.match(sql,/jsonb_array_elements\(NEW\.itinerary\)/);
 assert.match(sql,/v_route\.duration_minutes\*interval '1 minute'/);
 assert.match(sql,/v_depart-v_last_arrival<>interval '45 minutes'/);
 assert.match(sql,/NEW\.estimated_cost_eur<>v_cost/);
 assert.match(sql,/Crew must report at the ferry origin/);
 assert.match(sql,/Insufficient virtual crew rest before travel/);
 assert.match(sql,/Overlapping crew travel order/);
});
test('chronological worker fails closed on blocked prior arrival and never posts real cash',()=>{
 assert.match(sql,/SELECT s\.place,s\.event_at,s\.valid INTO v_place,v_time,v_valid/);
 assert.match(sql,/v_valid IS DISTINCT FROM true/);
 assert.match(sql,/state='enroute'/);
 assert.match(sql,/state='completed_virtual'/);
 assert.match(sql,/INSERT INTO public\.shadow_crew_travel_expenses/);
 assert.match(sql,/cash_movement boolean NOT NULL DEFAULT false CHECK\(NOT cash_movement\)/);
 assert.match(sql,/cron\.schedule\('aervelys-ops5-shadow-crew-travel-5min'/);
 assert.match(sql,/ON CONFLICT \(organization_id,source_kind,source_id,employee_id\) DO NOTHING/);
});
test('owner action uses RLS-bound session and never directly issues flights or records arrival',()=>{
 assert.match(action,/requireWorkspace\(\)/);
 assert.match(action,/shadow_crew_assignments/);
 assert.match(action,/shadow_crew_transfer_orders/);
 assert.match(action,/created_by_user_id:user\.id/);
 assert.doesNotMatch(action,/SERVICE_ROLE|service_role|createServiceClient/);
 assert.doesNotMatch(action,/shadow_crew_movements|shadow_crew_travel_expenses/);
 assert.match(page,/scheduleShadowCrewTransfer/);
 assert.match(page,/transfer_scheduled/);
});

test('hourly scenario worker settles ground transfers before ferry/charter catch-up',()=>{
 const hook=readFileSync(new URL('../supabase/migrations/20261108072000_ops5_shadow_crew_transfers_before_flights.sql',import.meta.url),'utf8');
 assert.match(hook,/advance_shadow_crew_transfers\(p_at\)/);
 assert.match(hook,/advance_shadow_positioning\(p_at\)/);
 assert.match(hook,/Unknown shadow flight worker version/);
 assert.match(hook,/EXECUTE v_sql/);
});
