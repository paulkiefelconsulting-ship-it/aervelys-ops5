import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const publicHome=readFileSync(new URL('../components/public-home.tsx',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../lib/workspace.ts',import.meta.url),'utf8');
test('public entry works when Supabase is not configured or session is missing',()=>{
 assert.match(home,/if\(!isSupabaseConfigured\(\)\)return <PublicHome\/>/);
 assert.match(home,/if\(authError\|\|!auth\.user\)return <PublicHome\/>/);
 assert.doesNotMatch(publicHome,/supabase|createClient|service.role|secret.key/i);
 assert.doesNotMatch(publicHome,/\.insert\(|\.update\(|\.delete\(/);
});
test('authenticated operator data remains scoped to the signed-in owner',()=>{
 assert.match(home,/supabase\.auth\.getUser\(\)/);
 assert.match(home,/owner_user_id',auth\.user\.id/);
 assert.match(home,/\.eq\('organization_id',id\)/);
 assert.match(workspace,/auth\.getUser\(\)/);
 assert.match(workspace,/redirect\('\/login'\)/);
});
test('public introduction uses the supplied brand mark and never exposes private data',()=>{
 assert.match(publicHome,/\/brand\/aervelys-mark\.svg/);
 assert.match(publicHome,/\/brand\/aervelys-wordmark\.svg/);
 assert.match(publicHome,/Kein Zugang zu internen Unternehmensakten/);
 assert.match(publicHome,/href="\/login"/);
});
