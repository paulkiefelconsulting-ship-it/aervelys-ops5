import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proposeShadowCrewTravel} from '../lib/shadow-crew-travel.mjs';

const anchor=(employeeId,locationIcao)=>({
 employeeId,eventType:'check_in',verificationState:'verified',
 sourceReference:'owner_manual_initial_checkin',
 locationIcao,occurredAt:'2026-11-07T06:00:00Z'
});
const flight={
 id:'flight-1',status:'planned',departureIcao:'EDDB',arrivalIcao:'LFMN',
 departureAt:'2026-11-07T12:00:00Z',
 arrivalAt:'2026-11-07T14:00:00Z',
 aircraftType:'Citation CJ4'
};
const ground={
 id:'transfer-1',employeeId:'captain',sourceKind:'ground',
 status:'completed_virtual',fromIcao:'EDAZ',toIcao:'EDDB',
 departedAt:'2026-11-07T08:30:00Z',arrivedAt:'2026-11-07T09:15:00Z'
};
const setup=()=>({
 asOf:'2026-11-07T09:30:00Z',
 people:[
  {id:'captain',name:'Captain Test',role:'PIC'},
  {id:'copilot',name:'First Officer Test',role:'SIC'}
 ],
 flights:[flight],assignments:[],
 checkins:[anchor('captain','EDAZ'),anchor('copilot','EDDB')],
 movements:[ground],
 routes:[{
  id:'shuttle',fromIcao:'EDAZ',toIcao:'EDDB',
  mode:'shuttle',durationMinutes:45,costEur:80,simulationOnly:true
 }],
 positioningLegs:[]
});

test('completed ground arrival makes next fictional flight onsite without another transfer charge',()=>{
 const result=proposeShadowCrewTravel(setup())[0];
 assert.equal(result.status,'scenario_proposal');
 assert.equal(result.pic?.id,'captain');
 assert.equal(result.pic?.fromIcao,'EDDB');
 assert.equal(result.pic?.toIcao,'EDDB');
 assert.deepEqual(result.pic?.steps,[]);
 assert.equal(result.pic?.travelMinutes,0);
 assert.equal(result.pic?.costEur,0);
 assert.equal(result.pic?.locationEvidence,'ground');
 assert.equal(result.estimatedCostEur,0);
});

test('earlier completed flight keeps rest clock even after a ground transfer',()=>{
 const input=setup();
 input.movements=[
  {id:'charter-previous',employeeId:'captain',sourceKind:'charter',
   status:'completed_virtual',fromIcao:'EDAZ',toIcao:'EDAZ',
   departedAt:'2026-11-07T06:30:00Z',arrivedAt:'2026-11-07T07:30:00Z'},
  {id:'transfer-1',employeeId:'captain',sourceKind:'ground',
   status:'completed_virtual',fromIcao:'EDAZ',toIcao:'EDDB',
   departedAt:'2026-11-07T08:30:00Z',arrivedAt:'2026-11-07T09:15:00Z'}
 ];
 const result=proposeShadowCrewTravel(input)[0];
 assert.equal(result.status,'blocked');
 assert.ok(result.issues.includes('TRAVEL_OR_REST_TIME_INSUFFICIENT'));
});

test('missing or unrecognised movement provenance never relaxes rest gates',()=>{
 const input=setup();
 input.movements=[{...ground,sourceKind:'unknown'}];
 const result=proposeShadowCrewTravel(input)[0];
 assert.equal(result.status,'blocked');
 assert.ok(result.issues.includes('TRAVEL_OR_REST_TIME_INSUFFICIENT'));
});

test('broken chronology still blocks even when the latest event is ground',()=>{
 const input=setup();
 input.movements=[{...ground,fromIcao:'EDDH'}];
 const result=proposeShadowCrewTravel(input)[0];
 assert.equal(result.status,'blocked');
 assert.ok(result.issues.includes('MOVEMENT_CHAIN_UNVERIFIED'));
});

test('page obtains actual persisted source_kind rather than guessing a movement type',()=>{
 const page=readFileSync(new URL('../app/crew-travel/page.tsx',import.meta.url),'utf8');
 assert.match(page,/\.select\('id,employee_id,source_kind,status,departed_at,arrived_at,from_icao,to_icao'\)/);
 assert.match(page,/sourceKind:m\.source_kind/);
 assert.match(page,/locationEvidence==='ground'/);
});
