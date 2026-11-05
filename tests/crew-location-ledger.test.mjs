import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCrewLocations,draftCrewArrivalEvent} from '../lib/crew-location-ledger.mjs';

const t0='2026-11-05T08:00:00Z',t1='2026-11-05T09:00:00Z';
const person=[{id:'pilot-1',name:'PIC',homeBaseIcao:'EDAZ',role:'PIC'}];
const checkin={
 id:'e0',employeeId:'pilot-1',eventType:'check_in',
 locationIcao:'EDAZ',originIcao:null,departedAt:null,
 occurredAt:t0,recordedAt:t0,verifiedAt:t0,
 verificationState:'verified',sourceReference:'ops:shift-1'
};
const project=(events,now='2026-11-05T12:00:00Z')=>projectCrewLocations({
 people:person,events,asOf:now,maxAgeMinutes:24*60
})[0];
test('initial evidenced check-in establishes location, never inferred from homebase',()=>{
 assert.equal(project([]).locationIcao,null);
 const p=project([checkin]);
 assert.equal(p.status,'verified');
 assert.equal(p.locationIcao,'EDAZ');
 assert.equal(p.sourceReference,'ops:shift-1');
});
test('aircraft arrival plus verified crew-travel arrival advances a chain',()=>{
 const leg={id:'e1',employeeId:'pilot-1',eventType:'flight_arrival',
  originIcao:'EDAZ',locationIcao:'EDDM',
  departedAt:'2026-11-05T08:15:00Z',occurredAt:t1,
  recordedAt:t1,verifiedAt:t1,verificationState:'verified',
  sourceReference:'completed-flight:AVF008'
 };
 const ground={id:'e2',employeeId:'pilot-1',eventType:'transfer_arrival',
  originIcao:'EDDM',locationIcao:'EDDN',departedAt:'2026-11-05T09:25:00Z',
  occurredAt:'2026-11-05T10:20:00Z',recordedAt:'2026-11-05T10:20:00Z',
  verifiedAt:'2026-11-05T10:20:00Z',verificationState:'verified',
  sourceReference:'crew-ride:198'
 };
 const p=project([ground,leg,checkin]);
 assert.equal(p.status,'verified');
 assert.equal(p.locationIcao,'EDDN');
 assert.equal(p.history.filter(e=>e.result==='accepted').length,3);
});
test('check-in at a different airport cannot teleport an assigned pilot',()=>{
 const p=project([checkin,{...checkin,id:'e1',locationIcao:'LFMN',
  occurredAt:t1,verifiedAt:t1,recordedAt:t1}]);
 assert.equal(p.status,'blocked');
 assert.equal(p.locationIcao,null);
 assert.equal(p.reason,'UNEXPLAINED_LOCATION_CHANGE');
});
test('flight arrival without evidenced origin/valid travel sequence is blocked',()=>{
 const p=project([checkin,{...checkin,id:'e1',eventType:'flight_arrival',
  originIcao:'EDDB',locationIcao:'LFMN',
  departedAt:'2026-11-05T08:30:00Z',occurredAt:t1,verifiedAt:t1,recordedAt:t1}]);
 assert.equal(p.reason,'MOVEMENT_CHAIN_BROKEN');
});
test('new pending movement invalidates older verified position',()=>{
 const p=project([checkin,{...checkin,id:'e1',
  eventType:'transfer_arrival',originIcao:'EDAZ',locationIcao:'EDDB',
  departedAt:'2026-11-05T08:25:00Z',
  occurredAt:t1,recordedAt:t1,verifiedAt:null,
  verificationState:'pending'}]);
 assert.equal(p.status,'blocked');
 assert.equal(p.locationIcao,null);
 assert.equal(p.reason,'LATEST_MOVEMENT_UNVERIFIED');
});
test('outdated locations cannot authorize new dispatch availability',()=>{
 const p=project([checkin],'2026-11-08T12:00:00Z');
 assert.equal(p.status,'stale');
 assert.equal(p.locationIcao,null);
 assert.equal(p.lastEvidenceIcao,'EDAZ');
});
test('later unknown location event revokes position despite verified prior check-in',()=>{
 const p=project([checkin,{...checkin,id:'e1',eventType:'location_unknown',
  locationIcao:null,verificationState:'pending',verifiedAt:null,
  occurredAt:t1,recordedAt:t1}]);
 assert.equal(p.status,'unknown');
 assert.equal(p.locationIcao,null);
});
test('future records never backdate positions and invalid dates are ignored',()=>{
 const p=project([checkin,{...checkin,id:'later',locationIcao:'EDDB',
  occurredAt:'2026-11-06T08:00:00Z',recordedAt:'2026-11-06T08:00:00Z',
  verifiedAt:'2026-11-06T08:00:00Z'}]);
 assert.equal(p.locationIcao,'EDAZ');
 assert.equal(p.history[1].result,'ignored');
});
test('draft arrival creates only pending evidence, never a verified claim',()=>{
 const e=draftCrewArrivalEvent({employeeId:'pilot-1',fromIcao:'EDAZ',
  toIcao:'EDDB',departedAt:'2026-11-05T08:00:00Z',
  arrivedAt:'2026-11-05T09:00:00Z',kind:'transfer_arrival',sourceReference:'shuttle:1'});
 assert.equal(e.status,'draft_only');
 assert.equal(e.verificationState,'pending');
 assert.equal(draftCrewArrivalEvent({employeeId:'pilot-1',fromIcao:'EDAZ',
  toIcao:'EDDB',departedAt:t1,arrivedAt:t0,kind:'transfer_arrival',
  sourceReference:'x'}).status,'blocked');
});
