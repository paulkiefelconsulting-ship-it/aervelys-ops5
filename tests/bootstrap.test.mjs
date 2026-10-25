import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../app/api/health/route.ts', import.meta.url),'utf8');
test('bootstrap explicitly reports no operational system',()=>{
  assert.match(source,/operational:false/);
  assert.match(source,/databaseConnected:false/);
  assert.match(source,/simulationRunning:false/);
});
const gitignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
test('local secrets are ignored by Git',()=>{assert.match(gitignore,/\.env\*/);});
