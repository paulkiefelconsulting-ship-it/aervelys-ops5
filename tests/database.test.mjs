import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const foundation = readFileSync(new URL('../supabase/migrations/20261025212128_ops5_initial_foundation.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../supabase/migrations/20261025212248_ops5_security_and_fk_indexes.sql', import.meta.url), 'utf8');

test('every new domain table enables row level security', () => {
  const tables = ['organizations','aircraft','employees','simulation_clock','resource_reservations','job_queue','audit_events'];
  for (const table of tables) {
    assert.match(foundation, new RegExp('alter table public\\.' + table + ' enable row level security;', 'i'));
  }
});

test('authenticated access is initially read-only and anonymous table access revoked', () => {
  assert.match(foundation, /from anon, authenticated;/);
  assert.match(foundation, /grant select on public\.organizations/);
  assert.doesNotMatch(foundation, /grant (?:insert|update|delete) on .* to authenticated/i);
});

test('confirmed aircraft reservations have database overlap guard', () => {
  assert.match(foundation, /constraint no_overlap_confirmed_aircraft exclude using gist/);
  assert.match(foundation, /where \(state in \('confirmed','operational_lock'\)\)/);
});

test('public extension warning is hardened in follow-up migration', () => {
  assert.match(hardening, /alter extension btree_gist set schema extensions;/);
});
