import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261026173146_ops5_crew_duty_rest_shadow_reviews.sql');

test('duty rest review is triggered by every new crew screening check and backfilled for historical checks',()=>{
 assert.match(migration,/create trigger crew_duty_review_after_screening_check/);
 assert.match(migration,/after insert on public\.crew_screening_checks/);
 assert.match(migration,/perform ops_internal\.review_crew_duty_check\(new\.id\)/);
 assert.match(migration,/select c\.id from public\.crew_screening_checks c/);
 assert.match(migration,/on conflict\(screening_check_id\) do nothing/);
});

test('roster evaluations can never authorize a pilot and incomplete histories always block',()=>{
 assert.match(migration,/status text not null default 'blocked' check\(status='blocked'\)/);
 assert.match(migration,/roster_complete boolean not null default false check\(not roster_complete\)/);
 assert.match(migration,/ROSTER_COMPLETENESS_UNVERIFIED/);
 assert.match(migration,/PREVIOUS_DUTY_HISTORY_NOT_ESTABLISHED/);
 assert.match(migration,/PLANNED_DUTY_WINDOW_UNKNOWN/);
});

test('illustrative rest and rolling thresholds detect past/future duty, overlaps and leave',()=>{
 for(const value of ['ILLUSTRATIVE_REST_GAP_LT_11H','ILLUSTRATIVE_FOLLOWING_REST_GAP_LT_11H',
  'ILLUSTRATIVE_7D_DUTY_GT_60H','ILLUSTRATIVE_28D_DUTY_GT_190H',
  'ILLUSTRATIVE_DUTY_WINDOW_GT_14H','CONFIRMED_DUTY_OR_REST_OVERLAP','ABSENCE_OVERLAP']){
  assert.ok(migration.includes(value),'Missing blocker '+value);
 }
 assert.match(migration,/public\.crew_duty_blocks/);
 assert.match(migration,/public\.leave_requests/);
 assert.match(migration,/tstzrange\(b\.starts_at,b\.ends_at,'\[\)'\)/);
});

test('per-employee snapshots are org-safe, owner-readable and immutable',()=>{
 assert.match(migration,/foreign key\(screening_check_id,organization_id\)/);
 assert.match(migration,/foreign key\(employee_id,organization_id\)/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/grant select on public\.crew_duty_reviews to authenticated/);
 assert.match(migration,/revoke all on public\.crew_duty_reviews from public,anon,authenticated/);
 assert.match(migration,/crew_duty_reviews_append_only before update or delete/);
 assert.match(migration,/revoke all on function ops_internal\.review_crew_duty_check\(uuid\)/);
});

test('new duty rest UI is authenticated, scoped and redacts sensitive credential details',()=>{
 const ui=read('app/duty-rest/page.tsx');
 assert.match(ui,/requireWorkspace\(\)/);
 assert.match(ui,/\.eq\('organization_id',organization\.id\)/);
 assert.match(ui,/keine luftfahrtrechtliche Einsatzfreigabe/i);
 assert.doesNotMatch(ui,/ops_private|legacy_medical_valid_until|monthly_gross_sim|service_role/);
});
