import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261116164614_ops5_persistent_agent_runtime_liaison.sql',import.meta.url),'utf8');

test('agent runtime creates scoped, auditable tables',()=>{
 assert.match(sql,/create table public\.agent_runtime_tasks/i);
 assert.match(sql,/create table public\.agent_runtime_events/i);
 assert.match(sql,/unique\s*\(\s*organization_id\s*,\s*source_sales_case_id\s*,\s*agent_role\s*\)/i);
 assert.match(sql,/unique\s*\(\s*task_id\s*,\s*sequence_no\s*\)/i);
 assert.match(sql,/for update of t skip locked/i);
});

test('agent events are simulation-only and never delivered externally',()=>{
 assert.match(sql,/simulation_only boolean not null default true check\s*\(\s*simulation_only is true\s*\)/i);
 assert.match(sql,/external_delivery boolean not null default false check\s*\(\s*external_delivery is false\s*\)/i);
 assert.match(sql,/contract_confirmed is false and s\.flight_released is false/i);
 assert.match(sql,/external_delivery is false/i);
 assert.doesNotMatch(sql,/\b(update|delete from)\s+public\.sim_sales_cases\b/i);
 assert.doesNotMatch(sql,/\b(insert into|update|delete from)\s+public\.sim_sales_messages\b/i);
});

test('agent runtime has owner-read access and no client write permissions',()=>{
 for(const table of ['agent_runtime_tasks','agent_runtime_events']){
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security','i'));
  assert.match(sql,new RegExp('create policy '+table+'_owner_read','i'));
 }
 assert.match(sql,/revoke all on public\.agent_runtime_tasks,public\.agent_runtime_events from PUBLIC, anon, authenticated/i);
 assert.match(sql,/grant select on public\.agent_runtime_tasks, public\.agent_runtime_events to authenticated/i);
 assert.match(sql,/revoke all on function ops_internal\.advance_agent_runtime\(timestamptz\) from PUBLIC,anon,authenticated/i);
 assert.match(sql,/security definer set search_path = ''/i);
});

test('scheduled worker operates without external model or network API',()=>{
 assert.match(sql,/cron\.schedule\('aervelys-ops5-agent-liaison-10min'/i);
 assert.doesNotMatch(sql,/\bnet\.http_post\b|\bopenai\b|\banthropic\b/i);
 assert.match(sql,/ops_internal\.advance_agent_runtime\(now\(\)\)/i);
});
