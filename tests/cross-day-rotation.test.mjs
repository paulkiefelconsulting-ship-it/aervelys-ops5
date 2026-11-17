import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditRotations} from '../lib/rotation-continuity.mjs';
const source=readFileSync(new URL('../app/rotation/page.tsx',import.meta.url),'utf8');
const aircraft=[{id:'jet',registration:'D-CJPK',aircraft_type:'Cessna Citation CJ4',current_icao:'EDAZ',operational_status:'available'}];
const first={id:'n1',aircraft_id:'jet',departure_icao:'EDAZ',arrival_icao:'EDDH',departure_at:'2026-11-20T23:10:00Z',arrival_at:'2026-11-21T00:20:00Z',status:'draft'};
const second={id:'n2',aircraft_id:'jet',departure_icao:'EDDH',arrival_icao:'EDDF',departure_at:'2026-11-21T01:30:00Z',arrival_at:'2026-11-21T02:50:00Z',status:'draft'};
test('cross-midnight legs are checked together, with 45 minute turnaround',()=>{
 const result=auditRotations({aircraft,flights:[second,first]})[0];
 assert.equal(result.legCount,2);
 assert.ok(!result.issues.some(x=>['TURNAROUND_SHORT','LEG_OVERLAP','FERRY_REQUIRED'].includes(x.code)));
 assert.equal(result.releaseAllowed,false);
});
test('cross-midnight short turnaround is caught',()=>{
 const result=auditRotations({aircraft,flights:[first,{...second,departure_at:'2026-11-21T00:40:00Z'}]})[0];
 assert.ok(result.issues.some(x=>x.code==='TURNAROUND_SHORT'));
});
test('cross-midnight ferry gap cannot be silently ignored',()=>{
 const result=auditRotations({aircraft,flights:[first,{...second,departure_icao:'EDDM'}]})[0];
 assert.ok(result.issues.some(x=>x.code==='FERRY_REQUIRED'));
});
test('three-day source context and overnight visibility are explicitly implemented',()=>{
 assert.match(source,/contextStart=new Date\(dayStart-86_400_000\)/);
 assert.match(source,/contextEnd=new Date\(dayEnd\+86_400_000\)/);
 assert.match(source,/gte\('departure_at',contextStart\)\.lt\('departure_at',contextEnd\)/);
 assert.match(source,/lt\('starts_at',contextEnd\)\.gt\('ends_at',contextStart\)/);
 assert.match(source,/Date\.parse\(f\.departure_at\)<dayEnd&&Date\.parse\(f\.arrival_at\)>dayStart/);
 assert.match(source,/auditRotations\(\{aircraft:fleet,flights:contextFlights,reservations:contextHolds/);
 assert.match(source,/contextFlights\.length<500&&contextHolds\.length<500/);
});
test('cross-day schedule remains owner scoped and does not mutate bookings',()=>{
 assert.match(source,/requireWorkspace\(\)/);
 assert.match(source,/\.eq\('organization_id',organization\.id\)/);
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|type="submit"/);
});
