import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditRotations} from '../lib/rotation-continuity.mjs';
const aircraft=[{id:'a',registration:'D-CJPK',aircraft_type:'Cessna Citation CJ4',current_icao:'EDAZ',operational_status:'available'}];
const leg=(id,from,to,start,end)=>({id,aircraft_id:'a',departure_icao:from,arrival_icao:to,departure_at:start,arrival_at:end,status:'draft'});
const first=leg('one','EDAZ','EDDH','2026-11-20T08:00:00Z','2026-11-20T09:30:00Z');
const second=leg('two','EDDH','EDDF','2026-11-20T11:00:00Z','2026-11-20T12:30:00Z');
const audit=(flights,reservations=[],aircraftSet=aircraft,dataComplete=true)=>auditRotations({aircraft:aircraftSet,flights,reservations,dataComplete});
test('connected multi-leg drafts have no fabricated conflict but never release',()=>{
 const result=audit([second,first])[0];
 assert.equal(result.legCount,2);
 assert.equal(result.issues.length,0);
 assert.equal(result.releaseAllowed,false);
 assert.equal(result.state,'review');
});
test('disconnect between charter legs needs explicit ferry proof',()=>{
 const result=audit([first,{...second,departure_icao:'EDDM'}])[0];
 assert.ok(result.issues.some(x=>x.code==='FERRY_REQUIRED'));
});
test('overlap and insufficient turnaround are identified',()=>{
 assert.ok(audit([first,{...second,departure_at:'2026-11-20T09:00:00Z'}])[0].issues.some(x=>x.code==='LEG_OVERLAP'));
 assert.ok(audit([first,{...second,departure_at:'2026-11-20T09:45:00Z'}])[0].issues.some(x=>x.code==='TURNAROUND_SHORT'));
});
test('EDAZ Longitude restriction and missing position block assumptions',()=>{
 const long=[{...aircraft[0],aircraft_type:'Cessna Citation Longitude',current_icao:null}];
 const result=audit([first],[],long)[0];
 assert.ok(result.issues.some(x=>x.code==='EDAZ_LONGITUDE_RESTRICTED'));
 assert.ok(result.issues.some(x=>x.code==='POSITION_UNVERIFIED'));
});
test('overlapping active reservation is visible; cancelled is ignored',()=>{
 const r={id:'hold',aircraft_id:'a',starts_at:'2026-11-20T08:10:00Z',ends_at:'2026-11-20T08:40:00Z',state:'confirmed'};
 assert.ok(audit([first],[r])[0].issues.some(x=>x.code==='RESERVATION_CONFLICT'));
 assert.ok(!audit([first],[{...r,state:'cancelled'}])[0].issues.some(x=>x.code==='RESERVATION_CONFLICT'));
});
test('truncated data is never treated as a complete schedule',()=>{
 assert.ok(audit([first],[],aircraft,false)[0].issues.some(x=>x.code==='DATA_INCOMPLETE'));
});
test('rotation page uses owner-scoped read only existing Supabase data',()=>{
 const s=readFileSync(new URL('../app/rotation/page.tsx',import.meta.url),'utf8');
 assert.match(s,/requireWorkspace\(\)/);
 assert.match(s,/auditRotations/);
 assert.match(s,/href=\{'\/charter-desk\?case='/);
 assert.match(s,/\.eq\('organization_id',organization\.id\)/);
 assert.doesNotMatch(s,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|type="submit"/);
});
