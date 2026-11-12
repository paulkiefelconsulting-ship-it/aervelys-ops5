import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCrewRosterForecast} from '../lib/crew-roster-forecast.mjs';

const sql=readFileSync(new URL('../supabase/migrations/20261112221500_ops5_sim_crew_roster_drafts.sql',import.meta.url),'utf8');
const action=readFileSync(new URL('../app/crew-mobility/roster-actions.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/crew-mobility/page.tsx',import.meta.url),'utf8');
const input=()=>({
 startDate:'2026-11-16',weeks:2,asOf:'2026-11-12T09:00:00Z',
 people:[{id:'p',name:'Pilot A',role:'PIC',employmentStatus:'active'}],
 dutyBlocks:[],shadowFlights:[],shadowAssignments:[],draftSlots:[],dataComplete:true
});
const slot=(id,startsAt,endsAt,kind='standby')=>({
 id,employeeId:'p',startsAt,endsAt,kind
});

test('saved standby proposal shows draft but never confirmed duty or operational release',()=>{
 const a=input();
 a.draftSlots=[slot('s','2026-11-16T09:00:00Z','2026-11-16T17:00:00Z')];
 const r=buildCrewRosterForecast(a);
 assert.equal(r.status,'preview');
 assert.equal(r.rows[0].days[0].kind,'draft');
 assert.equal(r.rows[0].days[0].events[0].state,'draft');
 assert.equal(r.totals.flightApprovals,0);
 assert.equal(r.totals.verifiedTypeRatings,0);
});

test('saved simulated absence still displays as draft, not approved leave',()=>{
 const a=input();
 a.draftSlots=[slot('s','2026-11-16T09:00:00Z','2026-11-16T17:00:00Z','absence')];
 assert.equal(buildCrewRosterForecast(a).rows[0].days[0].kind,'draft');
});

test('roster draft overlapping an existing confirmed duty produces visible conflict',()=>{
 const a=input();
 a.dutyBlocks=[{id:'d',employeeId:'p',kind:'flight',state:'confirmed',
  startsAt:'2026-11-16T10:00:00Z',endsAt:'2026-11-16T13:00:00Z'}];
 a.draftSlots=[slot('s','2026-11-16T09:00:00Z','2026-11-16T17:00:00Z')];
 const r=buildCrewRosterForecast(a);
 assert.equal(r.rows[0].days[0].kind,'conflict');
});

test('orphaned draft fails closed and gives no standby proposals',()=>{
 const a=input();
 a.draftSlots=[{...slot('s','2026-11-16T09:00:00Z','2026-11-16T17:00:00Z'),employeeId:'missing'}];
 const r=buildCrewRosterForecast(a);
 assert.equal(r.status,'unavailable');
 assert.deepEqual(r.standby,[]);
});

test('migration is isolated and enforces tenant foreign keys, RLS, and append-only events',()=>{
 assert.match(sql,/CREATE TABLE public\.sim_crew_roster_revisions/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/FOR SELECT TO authenticated/);
 assert.match(sql,/FOR INSERT TO authenticated/);
 assert.match(sql,/owner_user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/FOREIGN KEY\(employee_id,organization_id\) REFERENCES public\.employees/);
 assert.match(sql,/CREATE TRIGGER sim_crew_roster_no_edit BEFORE UPDATE OR DELETE/);
 assert.match(sql,/UNIQUE\(organization_id,series_id,revision\)/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|INSERT INTO) public\.(?:crew_duty_blocks|employees|shadow_flights)\b/i);
});

test('database trigger rejects forged versions, collisions, and operational side effects',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/v_previous\.revision\+1/);
 assert.match(sql,/Draft collides with another open draft/);
 assert.match(sql,/Draft overlaps an existing duty or absence/);
 assert.match(sql,/Draft overlaps an assigned virtual flight/);
 assert.match(sql,/CHECK\(NOT staff_notified\)/);
 assert.match(sql,/CHECK\(NOT operational_release\)/);
});

test('only an owner-scoped server action can append revision events',()=>{
 assert.match(action,/requireWorkspace\(\)/);
 assert.match(action,/\.from\('sim_crew_roster_revisions'\)\.insert/);
 assert.match(action,/created_by_user_id:user\.id/);
 assert.match(action,/simulation_only:true/);
 assert.match(action,/staff_notified:false/);
 assert.match(action,/operational_release:false/);
 assert.doesNotMatch(action,/\.from\('crew_duty_blocks'\)\.insert|service_role|sendMail|emails\.send/i);
});

test('autonomous Crew Mobility preserves immutable manual draft history without requiring CEO entry',()=>{
 assert.match(action,/export async function saveSimCrewRosterDraft/);
 assert.match(action,/event==='created'/);
 assert.match(action,/event==='cancelled'/);
 assert.match(page,/Autonomer Airline-Dienstplan/);
 assert.match(page,/Unveränderlicher Änderungsverlauf/);
 assert.match(page,/draftIncomplete/);
 assert.doesNotMatch(page,/<form action=\\{saveSimCrewRosterDraft\\}/);
 assert.doesNotMatch(page,/operational_release:true|staff_notified:true/);
});
