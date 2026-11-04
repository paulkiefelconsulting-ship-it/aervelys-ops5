import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeRotations} from '../lib/rotation-planner.mjs';
const base=()=>({
 aircraft:[{id:'cj4',registration:'D-CJPK',type:'CJ4',currentIcao:'EDAZ',
  availableAt:'2026-11-05T06:00:00Z',operationalStatus:'active',charterReleased:true,airportPerformanceVerified:true}],
 crew:[{id:'p',name:'Captain',role:'PIC',aircraftTypes:['CJ4'],currentIcao:'EDAZ',
  availableAt:'2026-11-05T06:00:00Z',verified:true,operationalStatus:'active'},
  {id:'s',name:'First Officer',role:'SIC',aircraftTypes:['CJ4'],currentIcao:'EDAZ',
   availableAt:'2026-11-05T06:00:00Z',verified:true,operationalStatus:'active'}],
 requests:[{id:'one',from:'EDAZ',to:'EDDM',departsAt:'2026-11-05T08:00:00Z',arrivesAt:'2026-11-05T09:15:00Z'}],
 aircraftRoutes:[],crewRoutes:[],turnaroundMinutes:30,crewReportMinutes:30
});
test('two compatible charters reuse one jet and both pilots crew the ferry',()=>{
 const d=base();d.requests.push({id:'two',from:'EDAZ',to:'EDDM',departsAt:'2026-11-05T12:00:00Z',arrivesAt:'2026-11-05T13:20:00Z'});
 d.aircraftRoutes.push({from:'EDDM',to:'EDAZ',durationMinutes:65,costEur:800});
 
 const r=proposeRotations(d);
 assert.equal(r[0].status,'proposed');assert.equal(r[1].status,'proposed');
 assert.equal(r[1].aircraftPositioning.from,'EDDM');
 assert.equal(r[1].aircraftPositioning.to,'EDAZ');
 assert.equal(r[1].crew.length,2);
 assert.equal(r[1].crew[0].positioning,null);
 assert.equal(r[1].crew[0].ferryDuty.from,'EDDM');
 assert.equal(r[1].crew[1].ferryDuty.to,'EDAZ');
});
test('unknown aircraft or crew positioning cannot be faked',()=>{
 const d=base();d.aircraft[0].currentIcao='EDDM';
 assert.equal(proposeRotations(d)[0].status,'blocked');
 d.aircraftRoutes.push({from:'EDDM',to:'EDAZ',durationMinutes:65,costEur:700});
 d.crew[0].currentIcao='EDDM';
 assert.equal(proposeRotations(d)[0].status,'blocked');
});
test('Longitude does not use EDAZ; Phenom 300E is blocked for charter',()=>{
 const d=base();d.aircraft[0].type='Citation Longitude';d.crew.forEach(c=>c.aircraftTypes=['Citation Longitude']);
 assert.equal(proposeRotations(d)[0].code,'EDAZ_LONGITUDE_RESTRICTED');
 d.aircraft[0].type='Phenom 300E';d.aircraft[0].charterReleased=false;
 assert.equal(proposeRotations(d)[0].code,'AIRCRAFT_NOT_RELEASED');
});
test('future confirmed aircraft commitment must remain reachable',()=>{
 const d=base();d.commitments=[{aircraftId:'cj4',startsAt:'2026-11-05T10:00:00Z',endsAt:'2026-11-05T11:00:00Z',fromIcao:'EDAZ'}];
 assert.equal(proposeRotations(d)[0].code,'FOLLOWING_COMMITMENT_UNREACHABLE');
});
test('draft crew, missing arrival and unverified airport performance fail closed',()=>{
 const d=base();d.crew[0].verified=false;
 assert.equal(proposeRotations(d)[0].status,'blocked');
 d.crew[0].verified=true;d.requests[0].arrivesAt=null;
 assert.equal(proposeRotations(d)[0].code,'INVALID_FLIGHT_WINDOW');
 d.requests[0].arrivesAt='2026-11-05T09:15:00Z';d.aircraft[0].airportPerformanceVerified=false;
 assert.equal(proposeRotations(d)[0].code,'AIRPORT_PERFORMANCE_NOT_VERIFIED');
});
test('unverified previous commitments do not silently reset aircraft position',()=>{
 const d=base();d.commitments=[{aircraftId:'cj4',startsAt:'2026-11-05T06:30:00Z',endsAt:'2026-11-05T07:00:00Z',fromIcao:'EDAZ'}];
 assert.equal(proposeRotations(d)[0].code,'PREVIOUS_COMMITMENT_LOCATION_UNVERIFIED');
});
