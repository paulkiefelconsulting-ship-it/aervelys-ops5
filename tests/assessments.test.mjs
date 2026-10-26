import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261026004604_ops5_charter_pricing_and_dispatch_prechecks.sql');
test('each charter lead receives an automatic immutable blocked precheck',()=>{
 assert.match(sql,/create trigger charter_auto_assess_insert/);
 assert.match(sql,/after insert on public\.charter_requests/);
 assert.match(sql,/unique\(organization_id,request_id\)/);
 assert.match(sql,/check\(review_status='blocked'\)/);
 assert.match(sql,/on conflict\(organization_id,request_id\) do nothing/);
});
test('scenario prices explicitly remain fictional and unavailable outside modeled routes',()=>{
 assert.match(sql,/fictional_scenario_v1/);
 assert.match(sql,/assumed_block_hours/);
 assert.match(sql,/if h is not null then/);
 assert.match(sql,/not verified airport distances/);
});
test('RLS and backend-only functions block public writes and privilege escalation',()=>{
 assert.match(sql,/alter table public\.charter_assessments enable row level security/);
 assert.match(sql,/grant select on public\.charter_assessments to authenticated/);
 assert.match(sql,/revoke all on function ops_internal\.evaluate_charter_request\(uuid\) from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant insert on public\.charter_assessments to authenticated/);
});
test('both module pages require server-verified organization',()=>{
 for(const path of ['app/dispatch/page.tsx','app/pricing/page.tsx']){
  const page=read(path);
  assert.match(page,/requireWorkspace\(\)/);
  assert.match(page,/\.eq\('organization_id',organization\.id\)/);
 }
});
test('no flight release or finance ledger writes in assessment migration',()=>{
 assert.doesNotMatch(sql,/insert into public\.flight_plans|insert into public\.resource_reservations|insert into public\.finance_drafts/);
});
