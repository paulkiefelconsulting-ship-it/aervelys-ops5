import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261026005521_ops5_crew_screening_shadow_scheduler.sql');

test('crew screenings always stay blocked and deduplicated by UTC day',()=>{
 assert.match(sql,/check\(status='blocked'\)/);
 assert.match(sql,/unique\(organization_id,request_id,screening_day\)/);
 assert.match(sql,/on conflict\(organization_id,request_id,screening_day\) do nothing/);
 assert.match(sql,/create trigger charter_crew_screening_after_insert/);
 assert.match(sql,/cron\.schedule\('aervelys-ops5-crew-screen-daily','25 5 \* \* \*'/);
});

test('confirmed crew work and rest assignments reject overlaps at database level',()=>{
 assert.match(sql,/crew_duty_no_confirmed_overlap exclude using gist/);
 assert.match(sql,/tstzrange\(starts_at,ends_at,'\[\)'\) with &&/);
 assert.match(sql,/foreign key\(employee_id,organization_id\)/);
});

test('screening checks staff status, type rating, medical, operator credentials, leave and roster conflicts',()=>{
 for(const key of ['TYPE_RATING_NOT_VERIFIED','MEDICAL_NOT_VERIFIED',
  'OPERATOR_CHECKS_NOT_VERIFIED','CREDENTIAL_SET_NOT_VERIFIED','LEAVE_CONFLICT',
  'DUTY_OVERLAP','DUTY_AND_REST_ROSTER_NOT_VERIFIED','CREW_CURRENT_LOCATION_NOT_VERIFIED']){
  assert.ok(sql.includes(key),'Missing mandatory blocker '+key);
 }
 assert.match(sql,/ops_private\.employee_compliance/);
 assert.match(sql,/ops_private\.crew_credential_evidence/);
 assert.match(sql,/public\.leave_requests/);
});

test('backend-only automation cannot be called from an authenticated browser',()=>{
 assert.match(sql,/revoke all on function ops_internal\.screen_charter_crew\(uuid,date\) from public,anon,authenticated/);
 assert.match(sql,/revoke all on function ops_internal\.refresh_crew_screenings\(date\) from public,anon,authenticated/);
 assert.match(sql,/grant select on public\.\%I to authenticated/);
 assert.doesNotMatch(sql,/grant insert on public\.crew_screening_checks to authenticated/);
});

test('crew screening page requires owner workspace and hides private evidence',()=>{
 const source=read('app/crew-scheduling/page.tsx');
 assert.match(source,/requireWorkspace\(\)/);
 assert.match(source,/\.eq\('organization_id',organization\.id\)/);
 assert.match(source,/Gesperrt/);
 assert.doesNotMatch(source,/ops_private|monthly_gross_sim|legacy_medical_valid_until/);
});
