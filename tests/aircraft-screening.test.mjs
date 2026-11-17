import test from 'node:test';
import assert from 'node:assert/strict';
import {screenAircraftForCharter} from '../lib/aircraft-screening.mjs';
import {readFileSync} from 'node:fs';
const request={departure_icao:'EDAZ',arrival_icao:'EDDH',departure_at:'2026-11-20T12:00:00Z'};
const a=(id,aircraft_type='Embraer Phenom 300E',operational_status='available',current_icao='EDAZ')=>({id,registration:'D-'+id,aircraft_type,operational_status,current_icao});
const screen=(aircraft,reservations=[],req=request,dataComplete=true)=>screenAircraftForCharter({request:req,aircraft,reservations,dataComplete});
test('EDAZ blocks Citation Longitude even when other evidence looks clear',()=>{
 const result=screen([a('BLNG','Cessna Citation Longitude')])[0];
 assert.equal(result.status,'blocked');
 assert.ok(result.issues.some(x=>x.code==='EDAZ_LONGITUDE_RESTRICTED'));
 const other=screen([a('BLNG','Cessna Citation Longitude','available','EDDB')],[],{...request,departure_icao:'EDDB',arrival_icao:'EDAZ'})[0];
 assert.ok(other.issues.some(x=>x.code==='EDAZ_LONGITUDE_RESTRICTED'));
});
test('no aircraft is ever automatically released',()=>{
 const r=screen([a('CPHE')])[0];
 assert.equal(r.status,'review');
 assert.ok(r.issues.some(x=>x.code==='OPERATIONS_NOT_VERIFIED'));
 assert.notEqual(r.status,'available');
});
test('missing aircraft position and unknown positioning are not treated as ready',()=>{
 assert.ok(screen([a('ABC','Embraer Phenom 300E','available',null)])[0].issues.some(x=>x.code==='POSITION_UNKNOWN'));
 assert.ok(screen([a('ABC','Embraer Phenom 300E','available','EDDB')])[0].issues.some(x=>x.code==='FERRY_UNVERIFIED'));
});
test('current reservation at departure blocks, nonactive or ended does not',()=>{
 const r={aircraft_id:'ABC',starts_at:'2026-11-20T10:00:00Z',ends_at:'2026-11-20T13:00:00Z',state:'confirmed'};
 assert.ok(screen([a('ABC')],[r])[0].issues.some(x=>x.code==='EXISTING_RESERVATION'));
 assert.ok(!screen([a('ABC')],[{...r,state:'cancelled'}])[0].issues.some(x=>x.code==='EXISTING_RESERVATION'));
 assert.ok(!screen([a('ABC')],[{...r,ends_at:'2026-11-20T12:00:00Z'}])[0].issues.some(x=>x.code==='EXISTING_RESERVATION'));
});
test('inactive aircraft and truncated data fail closed',()=>{
 const r=screen([a('ABC','Pilatus PC-24','inactive','EDAZ')],[],request,false)[0];
 assert.equal(r.status,'blocked');
 assert.ok(r.issues.some(x=>x.code==='AIRCRAFT_NOT_AVAILABLE'));
 assert.ok(r.issues.some(x=>x.code==='DATA_INCOMPLETE'));
});
test('screening is shown only inside owner scoped charter desk and cannot write operations',()=>{
 const ui=readFileSync(new URL('../app/charter-desk/page.tsx',import.meta.url),'utf8');
 assert.match(ui,/requireWorkspace\(\)/);
 assert.match(ui,/from\('aircraft'\)/);
 assert.match(ui,/from\('resource_reservations'\)/);
 assert.match(ui,/screenAircraftForCharter/);
 assert.match(ui,/Keine Flugfreigabe/);
 assert.doesNotMatch(ui,/\.insert\(|\.upsert\(|\.update\(|type="submit"/);
});
