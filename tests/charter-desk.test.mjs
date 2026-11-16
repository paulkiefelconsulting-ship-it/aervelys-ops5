import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const desk=readFileSync(new URL('../app/charter-desk/page.tsx',import.meta.url),'utf8');
const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const menu=readFileSync(new URL('../components/ops-shell.tsx',import.meta.url),'utf8');
test('charter desk uses authenticated organization scoped source tables',()=>{
 assert.match(desk,/requireWorkspace\(\)/);
 for(const table of ['charter_requests','sim_sales_cases','sim_crm_personas','charter_assessments','agent_runtime_tasks','sim_sales_messages'])
  assert.match(desk,new RegExp("from\\('"+table+"'\\)"));
 assert.match(desk,/\.eq\('organization_id',org\)/);
 assert.match(desk,/requests\.find\(r=>r\.id===requested\)/);
});
test('charter desk presents distinct simulation, sales, and ops evidence without committing anything',()=>{
 assert.match(desk,/Keine Flugfreigabe, keine Crew-Buchung und keine externe Angebotszustellung/);
 assert.match(desk,/OPS \/ Safety/);
 assert.match(desk,/Unverbindlich|unverbindlich/);
 assert.doesNotMatch(desk,/\.insert\(|\.update\(|\.upsert\(|<form|type="submit"/);
 assert.doesNotMatch(desk,/service_role|SUPABASE_SERVICE_ROLE|secret_key/i);
});
test('dashboard and main navigation link to the unified charter case desk',()=>{
 assert.match(menu,/href="\/charter-desk"/);
 assert.match(menu,/href="\/sales-autopilot"/);
 assert.match(home,/href="\/charter-desk"/);
 assert.match(home,/encodeURIComponent\(r\.id\)/);
});
