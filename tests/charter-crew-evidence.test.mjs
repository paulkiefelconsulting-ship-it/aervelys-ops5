import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../app/charter-desk/page.tsx',import.meta.url),'utf8');
test('crew evidence is scoped to authenticated owner and selected charter',()=>{
 assert.match(ui,/requireWorkspace\(\)/);
 assert.match(ui,/from\('crew_screening_runs'\)/);
 assert.match(ui,/\.eq\('organization_id',org\)\.eq\('request_id',selected\.id\)/);
 assert.match(ui,/\.eq\('organization_id',org\)\.eq\('screening_id',crewRun\.id\)/);
 assert.match(ui,/\.eq\('organization_id',org\)\.in\('id',employeeIds\)/);
});
test('crew evidence is read-only, bounded and clearly no dispatch release',()=>{
 assert.match(ui,/order\('created_at',\{ascending:false\}\)\.limit\(1\)/);
 assert.match(ui,/crewChecks\.length===150/);
 assert.match(ui,/Keine Crew-Eignung ableitbar/);
 assert.match(ui,/Kein Crew-Release/);
 assert.match(ui,/keinen Mitarbeiter ein/);
 assert.doesNotMatch(ui,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|<form|type="submit"/);
});
test('medical and qualification details are summarized as boolean evidence only',()=>{
 assert.match(ui,/rating_verified/);
 assert.match(ui,/medical_verified/);
 assert.match(ui,/duty_roster_verified/);
 assert.match(ui,/location_verified/);
 assert.match(ui,/blocking_reasons/);
 assert.doesNotMatch(ui,/medical_document|passport_number|salary_eur|license_document/);
});
