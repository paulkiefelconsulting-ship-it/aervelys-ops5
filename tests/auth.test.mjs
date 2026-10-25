import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('server-only password sign-in; no public sign-up or privilege bootstrap', () => {
  const actions = read('app/auth/actions.ts');
  assert.match(actions, /'use server'/);
  assert.match(actions, /signInWithPassword/);
  assert.doesNotMatch(actions, /signUp\s*\(/);
  assert.doesNotMatch(actions, /service_role|serviceRole|secret_key/);
});

test('server-verified identity and owner-scoped data read', () => {
  const page = read('app/page.tsx');
  assert.match(page, /auth\.getUser\(\)/);
  assert.match(page, /\.eq\('owner_user_id', auth\.user\.id\)/);
  assert.match(page, /redirect\('\/login/);
});

test('token refresh proxy verifies claims and preserves cache headers', () => {
  const proxy = read('lib/supabase/proxy.ts');
  assert.match(proxy, /auth\.getClaims\(\)/);
  assert.match(proxy, /response\.headers\.set/);
  assert.doesNotMatch(proxy, /auth\.getSession\(\)/);
});

test('publishable-only keys and explicit non-operational health', () => {
  const config = read('lib/supabase/config.ts');
  const health = read('app/api/health/route.ts');
  assert.match(config, /sb_publishable_/);
  assert.match(health, /operational: false/);
  assert.match(health, /simulationRunning: false/);
});
