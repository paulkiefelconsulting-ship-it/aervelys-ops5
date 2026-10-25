import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const defs=source('lib/modules.ts');
const acts=source('app/modules/actions.ts');
const migration=source('supabase/migrations/20261025232714_ops5_module_workspace_foundation.sql');
test('exactly sixteen module definitions with explicit tables',()=>{
 assert.equal((defs.match(/\bm\('/g)||[]).length,16);
 assert.match(defs,/moduleSections/);
 assert.match(source('app/modules/[slug]/page.tsx'),/getModule\(slug\)/);
});
test('new tables secured by RLS, no anonymous grants and trigger audit',()=>{
 assert.equal((migration.match(/create table public\./g)||[]).length,12);
 assert.equal((migration.match(/enable row level security/g)||[]).length,12);
 assert.match(migration,/revoke all on public\.customers from anon, authenticated/);
 assert.match(migration,/ops_internal\.audit_creation/);
 assert.match(migration,/reservations_owner_option/);
});
test('server actions do not accept arbitrary org or operational state',()=>{
 assert.match(acts,/requireWorkspace\(\)/);
 assert.match(acts,/organization_id:organization.id/);
 assert.match(acts,/insert.status='draft'/);
 assert.match(acts,/insert.state='option'/);
 assert.match(acts,/insert.operational_status='inactive'/);
 assert.doesNotMatch(acts,/service_role|serviceRole|secret_key/);
});
test('no write form on read only modules',()=>{
 assert.match(source('app/modules/[slug]/page.tsx'),/module.readonly/);
 assert.match(acts,/module.readonly/);
});
