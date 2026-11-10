import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proposeShadowCrewDispatch} from '../lib/shadow-crew-dispatch.mjs';

const flight=(id,dep,arr,origin='EDAZ',destination='LFMN')=>({
 id,status:'planned',departureIcao:origin,arrivalIcao:destination,
 departureAt:dep,arrivalAt:arr
});
const candidate=(id,role,price,report,origin='EDAZ',destination='EDAZ')=>({
 id,name:id,role,issue:null,costEur:price,startsAt:report,
 reportAt:report,fromIcao:origin,toIcao:destination,travelMinutes:0
});
const plan=(f,pics,sics,report)=>({
 flightId:f.id,status:'scenario_proposal',issue:null,
 boardingIcao:f.departureIcao,reportAt:report,
 candidates:{PIC:pics,SIC:sics}
});
const t1='2026-11-11T10:00:00Z',t2='2026-11-11T10:30:00Z';
const a=flight('f1','2026-11-11T11:00:00Z','2026-11-11T14:00:00Z');
const b=flight('f2','2026-11-11T11:30:00Z','2026-11-11T15:00:00Z');
const pic=(id,price,report=t1,origin='EDAZ')=>candidate(id,'PIC',price,report,origin);
const sic=(id,price,report=t1,origin='EDAZ')=>candidate(id,'SIC',price,report,origin);

test('conflicting flights get different pilots even if the individual cheaper choices coincide',()=>{
 const rows=proposeShadowCrewDispatch({flights:[b,a],plans:[
  plan(a,[pic('A',10),pic('C',40)],[sic('B',10),sic('D',40)],t1),
  plan(b,[pic('A',10,t2),pic('C',40,t2)],[sic('B',10,t2),sic('D',40,t2)],t2)
 ]});
 assert.deepEqual(rows.map(r=>r.flightId),['f1','f2']);
 assert.deepEqual(rows.map(r=>[r.pic.id,r.sic.id]),[['A','B'],['C','D']]);
 assert.deepEqual(rows.map(r=>r.costEur),[20,80]);
 assert.equal(rows.every(r=>r.status==='proposal'),true);
});

test('missing alternate PIC never creates a crew double-assignment',()=>{
 const rows=proposeShadowCrewDispatch({flights:[a,b],plans:[
  plan(a,[pic('A',10)],[sic('B',10)],t1),
  plan(b,[pic('A',10,t2)],[sic('D',10,t2)],t2)
 ]});
 assert.equal(rows[0].status,'proposal');
 assert.equal(rows[1].status,'blocked');
 assert.equal(rows[1].reason,'NO_CONFLICT_FREE_CREW_PAIR');
});

test('sequential hypothetical reuse needs both matching arrival airport and simulated rest',()=>{
 const next=flight('f3','2026-11-12T08:00:00Z','2026-11-12T10:00:00Z','EDAZ','EDDM');
 const later='2026-11-12T07:00:00Z';
 const first=flight('f1','2026-11-11T11:00:00Z','2026-11-11T14:00:00Z','EDAZ','EDAZ');
 const plans=[
  plan(first,[pic('A',10)],[sic('B',10)],t1),
  plan(next,[pic('A',10,later)],[sic('B',10,later)],later)
 ];
 const rows=proposeShadowCrewDispatch({flights:[first,next],plans});
 assert.deepEqual(rows.map(r=>r.status),['proposal','proposal']);
 const tooSoon='2026-11-11T19:00:00Z';
 const short=flight('f3','2026-11-11T20:00:00Z','2026-11-11T22:00:00Z','EDAZ','EDDM');
 const changed=proposeShadowCrewDispatch({flights:[first,short],
  plans:[plans[0],plan(short,[pic('A',10,tooSoon)],[sic('B',10,tooSoon)],tooSoon)]});
 assert.equal(changed[1].status,'blocked');
 assert.equal(changed[1].reason,'NO_CONFLICT_FREE_CREW_PAIR');
});

test('hypothetical arrival at another airport never teleports into future dispatch',()=>{
 const next=flight('f3','2026-11-12T08:00:00Z','2026-11-12T10:00:00Z','EDAZ','EDDM');
 const report='2026-11-12T07:00:00Z';
 const rows=proposeShadowCrewDispatch({flights:[a,next],
  plans:[plan(a,[pic('A',10)],[sic('B',10)],t1),
   plan(next,[pic('A',10,report)],[sic('B',10,report)],report)]});
 assert.equal(rows[1].status,'blocked');
});

test('saved crew seat remains locked ahead of greedy proposals',()=>{
 const rows=proposeShadowCrewDispatch({flights:[a,b],
  assignments:[{shadowFlightId:'f2',employeeId:'A',role:'PIC'}],
  plans:[
   plan(a,[pic('A',1),pic('C',20)],[sic('B',5)],t1),
   plan(b,[pic('A',2,t2)],[sic('D',5,t2)],t2)
  ]});
 assert.equal(rows[0].pic.id,'C');
 assert.equal(rows[1].pic.id,'A');
 assert.equal(rows[1].lockedSeats,1);
});

test('two persisted future assignments of same pilot block both contradictory records',()=>{
 const assignments=[
  {shadowFlightId:'f1',employeeId:'A',role:'PIC'},
  {shadowFlightId:'f2',employeeId:'A',role:'PIC'}
 ];
 const rows=proposeShadowCrewDispatch({flights:[a,b],assignments,
  plans:[plan(a,[pic('A',10)],[sic('B',10)],t1),
   plan(b,[pic('A',10,t2)],[sic('D',10,t2)],t2)]});
 assert.equal(rows[0].reason,'CONFLICTING_SAVED_CREW_ASSIGNMENTS');
 assert.equal(rows[1].reason,'CONFLICTING_SAVED_CREW_ASSIGNMENTS');
});

test('unknown or incomplete candidates do not get transformed into authorized pairings',()=>{
 const invalid=pic('A',10);delete invalid.startsAt;
 const rows=proposeShadowCrewDispatch({flights:[a],
  plans:[plan(a,[invalid],[sic('B',10)],t1)]});
 assert.equal(rows[0].status,'blocked');
 assert.equal(rows[0].pic,null);
 const blocked=proposeShadowCrewDispatch({flights:[a],plans:[{
  ...plan(a,[pic('A',10)],[sic('B',10)],t1),status:'blocked',issue:'FLEET_BLOCKED'
 }]});
 assert.equal(blocked[0].reason,'FLEET_BLOCKED');
 assert.throws(()=>proposeShadowCrewDispatch({minimumRestMinutes:-10}),TypeError);
});

test('integration is a read-only planning layer, not a new booking or financial writer',()=>{
 const source=readFileSync(new URL('../lib/shadow-crew-dispatch.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../app/crew-travel/page.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\bfetch\(|service_role|\.rpc\(/i);
 assert.match(ui,/proposeShadowCrewDispatch/);
 assert.match(ui,/Koordinierte Crewvorschläge/);
});
