import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCrewRosterForecast} from '../lib/crew-roster-forecast.mjs';

const P=[
 {id:'captain-a',name:'Captain Alpha',role:'PIC',employmentStatus:'active'},
 {id:'captain-b',name:'Captain Bravo',role:'PIC',employmentStatus:'active'},
 {id:'officer-a',name:'First Officer Alpha',role:'SIC',employmentStatus:'active'},
 {id:'officer-b',name:'First Officer Bravo',role:'SIC',employmentStatus:'active'}
];
const base=()=>({
 startDate:'2026-11-16',weeks:2,asOf:'2026-11-12T09:00:00Z',
 people:P,dutyBlocks:[],shadowFlights:[],shadowAssignments:[],dataComplete:true
});
const block=(id,employeeId,start,end,kind='flight',state='confirmed')=>({
 id,employeeId,startsAt:start,endsAt:end,kind,state
});
const flight={
 id:'shadow1',status:'planned',departureAt:'2026-11-17T12:00:00Z',
 arrivalAt:'2026-11-17T14:00:00Z',departureIcao:'EDDB',arrivalIcao:'EDDH'
};

test('two, four, eight and twelve-week horizons are exact UTC calendar windows',()=>{
 for(const weeks of [2,4,8,12]){
  const r=buildCrewRosterForecast({...base(),weeks});
  assert.equal(r.status,'preview');
  assert.equal(r.days.length,weeks*7);
  assert.equal(r.weeksSummary.length,weeks);
  assert.equal(r.rows[0].days.length,weeks*7);
  assert.equal(r.weeksSummary[0].startDate,'2026-11-16');
 }
 assert.throws(()=>buildCrewRosterForecast({...base(),weeks:3}),TypeError);
 assert.throws(()=>buildCrewRosterForecast({...base(),startDate:'2026-11-31'}),TypeError);
});

test('unknown day is never falsely labelled confirmed free, and draft duties remain drafts',()=>{
 const r=buildCrewRosterForecast({...base(),dutyBlocks:[
  block('d1','captain-a','2026-11-16T09:00:00Z','2026-11-16T13:00:00Z','training','planned')
 ]});
 const days=r.rows.find(x=>x.employeeId==='captain-a').days;
 assert.equal(days[0].kind,'draft');
 assert.equal(days[1].kind,'unplanned');
});

test('previously recorded duty and leave block both stay visible',()=>{
 const r=buildCrewRosterForecast({...base(),dutyBlocks:[
  block('d1','captain-a','2026-11-16T09:00:00Z','2026-11-16T12:00:00Z'),
  block('d2','captain-a','2026-11-18T00:00:00Z','2026-11-19T00:00:00Z','leave','confirmed')
 ]});
 const days=r.rows.find(x=>x.employeeId==='captain-a').days;
 assert.equal(days[0].kind,'recorded');
 assert.equal(days[2].kind,'absence');
 assert.equal(days[3].kind,'unplanned');
});

test('actual persisted shadow flight assignment is marked SIM, not a real flight clearance',()=>{
 const r=buildCrewRosterForecast({...base(),shadowFlights:[flight],
  shadowAssignments:[{shadowFlightId:'shadow1',employeeId:'captain-a',role:'PIC'}]});
 const c=r.rows.find(x=>x.employeeId==='captain-a').days[1];
 assert.equal(c.kind,'shadow');
 assert.match(c.events[0].label,/EDDB.*EDDH/);
 assert.equal(r.totals.flightApprovals,0);
 assert.equal(r.totals.verifiedTypeRatings,0);
});

test('overlapping entries across systems fail visible roster conflict review',()=>{
 const r=buildCrewRosterForecast({...base(),
  dutyBlocks:[block('d1','captain-a','2026-11-17T11:30:00Z','2026-11-17T13:00:00Z')],
  shadowFlights:[flight],
  shadowAssignments:[{shadowFlightId:'shadow1',employeeId:'captain-a',role:'PIC'}]});
 assert.equal(r.rows.find(x=>x.employeeId==='captain-a').days[1].kind,'conflict');
 assert.ok(r.totals.conflictDays>0);
});

test('short simulated rest between distinct working periods flags the later period',()=>{
 const r=buildCrewRosterForecast({...base(),dutyBlocks:[
  block('d1','captain-a','2026-11-16T11:00:00Z','2026-11-16T23:00:00Z'),
  block('d2','captain-a','2026-11-17T07:00:00Z','2026-11-17T12:00:00Z')
 ]});
 const days=r.rows.find(x=>x.employeeId==='captain-a').days;
 assert.equal(days[0].kind,'recorded');
 assert.equal(days[1].kind,'conflict');
});

test('standby proposals rotate eligible active pilots while keeping status unverified',()=>{
 const r=buildCrewRosterForecast(base());
 const choices=r.standby.slice(0,6);
 assert.ok(choices.every(x=>x.PIC&&x.SIC));
 const pics=new Set(choices.map(x=>x.PIC.employeeId));
 const sics=new Set(choices.map(x=>x.SIC.employeeId));
 assert.deepEqual([...pics].sort(),['captain-a','captain-b']);
 assert.deepEqual([...sics].sort(),['officer-a','officer-b']);
 assert.ok(choices.every(x=>x.qualificationStatus==='UNVERIFIED'));
 assert.equal(r.rows[0].days[0].kind,'unplanned');
});

test('unverified draft employment, leave and working-duty buffers cannot become confirmed standby',()=>{
 const input=base();
 input.people=[
  {...P[0],employmentStatus:'draft'},
  {...P[2]},
 ];
 input.dutyBlocks=[block('leave','officer-a','2026-11-16T00:00:00Z',
  '2026-11-17T00:00:00Z','leave','confirmed')];
 const r=buildCrewRosterForecast(input);
 assert.equal(r.standby[0].PIC,null);
 assert.equal(r.standby[0].SIC,null);
 assert.ok(r.standby[2].SIC);
});

test('incomplete or orphaned records block all proposed standby or free-day assumptions',()=>{
 const partial=buildCrewRosterForecast({...base(),dataComplete:false});
 assert.equal(partial.status,'unavailable');
 assert.deepEqual(partial.standby,[]);
 const orphan=buildCrewRosterForecast({...base(),shadowAssignments:[
  {shadowFlightId:'missing',employeeId:'captain-a',role:'PIC'}
 ]});
 assert.equal(orphan.status,'unavailable');
 assert.equal(orphan.reason,'INVALID_OR_ORPHANED_SCHEDULE');
});

test('over-midnight duty stays visible in both dates, not just departure date',()=>{
 const r=buildCrewRosterForecast({...base(),dutyBlocks:[
  block('overnight','captain-a','2026-11-16T23:30:00Z','2026-11-17T01:00:00Z')
 ]});
 const days=r.rows.find(x=>x.employeeId==='captain-a').days;
 assert.equal(days[0].kind,'recorded');
 assert.equal(days[1].kind,'recorded');
});

test('source is pure and interface uses authenticated workspace with owner-filtered reads',()=>{
 const source=readFileSync(new URL('../lib/crew-roster-forecast.mjs',import.meta.url),'utf8');
 const page=readFileSync(new URL('../app/crew-mobility/page.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|\bfetch\(|service_role|\.rpc\(/i);
 assert.match(page,/requireWorkspace\(\)/);
 assert.match(page,/proposeShadowCrewDispatch|buildCrewRosterForecast/);
 assert.match(page,/\.eq\('organization_id',organization\.id\)/);
 assert.match(page,/rosterComplete/);
 assert.match(page,/Kein Dienst erfasst/);
});
