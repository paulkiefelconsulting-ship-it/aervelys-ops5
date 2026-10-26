import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('staff pages resolve only through verified workspace and org-filtered records',()=>{
 const page=read('app/staff/[id]/page.tsx');
 assert.match(page,/requireWorkspace\(\)/);
 assert.match(page,/\.eq\('organization_id',organization\.id\)/);
 assert.match(page,/\.eq\('employee_id',id\)/);
 assert.match(page,/notFound\(\)/);
});
test('qualifications are visibly not operational authorizations',()=>{
 const page=read('app/staff/[id]/page.tsx');
 assert.match(page,/Nicht verifiziert/);
 assert.match(page,/Simulationsberechtigung/);
 assert.match(page,/medical|Medicals/);
 assert.doesNotMatch(page,/ops_private|monthly_gross_sim|service_role/);
});
test('crew register links to individual profiles',()=>{
 assert.match(read('app/modules/[slug]/page.tsx'),/\/staff\//);
 assert.match(read('lib/modules.ts'),/Zentrales Crew- und OPS-Personalregister/);
});
