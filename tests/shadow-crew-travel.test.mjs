import test from 'node:test';
import assert from 'node:assert/strict';
import {listCrewItineraries,proposeShadowCrewTravel} from '../lib/shadow-crew-travel.mjs';

const now='2026-11-07T08:00:00Z';
const anchor=(id,place,at='2026-11-07T07:00:00Z')=>({
 employeeId:id,eventType:'check_in',verificationState:'verified',
 sourceReference:'owner_manual_initial_checkin',locationIcao:place,occurredAt:at
});
const route=(id,fromIcao,toIcao,mode,durationMinutes,costEur)=>({
 id,fromIcao,toIcao,mode,durationMinutes,costEur,simulationOnly:true
});
const flight=(id='f1',from='EDDB',to='LFMN',start='2026-11-07T12:00:00Z',end='2026-11-07T14:00:00Z')=>({
 id,status:'planned',departureIcao:from,arrivalIcao:to,
 departureAt:start,arrivalAt:end,aircraftType:'Citation CJ4'
});
const base=()=>({
 asOf:now,people:[{id:'a',name:'Captain Alpha',role:'PIC'},
 {id:'b',name:'First Officer Bravo',role:'SIC'}],
 flights:[flight()],assignments:[],movements:[],positioningLegs:[],
 checkins:[anchor('a','EDAZ'),anchor('b','EDDB')],
 routes:[route('r1','EDAZ','EDDB','shuttle',45,80)]
});

test('direct shuttle positions PIC, SIC on-site, and prices exactly the fictional journey',()=>{
 const plan=proposeShadowCrewTravel(base())[0];
 assert.equal(plan.status,'scenario_proposal');
 assert.equal(plan.pic.name,'Captain Alpha');
 assert.equal(plan.pic.fromIcao,'EDAZ');
 assert.equal(plan.pic.toIcao,'EDDB');
 assert.equal(plan.pic.travelMinutes,45);
 assert.equal(plan.pic.steps[0].startsAt,'2026-11-07T10:15:00.000Z');
 assert.equal(plan.pic.steps[0].endsAt,'2026-11-07T11:00:00.000Z');
 assert.equal(plan.sic.travelMinutes,0);
 assert.equal(plan.estimatedCostEur,80);
});

test('two-leg itinerary includes direction, explicit connection and cost',()=>{
 const routes=[
  route('a','EDAZ','EDDB','shuttle',40,65),
  route('b','EDDB','LFMN','airline',100,210),
  route('c','EDAZ','LFMN','airline',200,320),
  route('bad','EDAZ','EDDB','shuttle',10,0)
 ];
 routes[3].simulationOnly=false;
 const plans=listCrewItineraries('EDAZ','LFMN',routes,45);
 assert.equal(plans[0].legs.length,2);
 assert.equal(plans[0].costEur,275);
 assert.equal(plans[0].durationMinutes,185);
 assert.equal(plans[1].costEur,320);
 assert.equal(listCrewItineraries('LFMN','EDAZ',routes).length,0);
});

test('only feasible option is selected even when a cheaper option is too slow',()=>{
 const input=base();input.routes=[
  route('slow','EDAZ','EDDB','rail',240,20),
  route('fast','EDAZ','EDDB','shuttle',40,120)
 ];
 input.asOf='2026-11-07T09:00:00Z';
 const plan=proposeShadowCrewTravel(input)[0];
 assert.equal(plan.pic.steps[0].routeId,'fast');
 assert.equal(plan.estimatedCostEur,120);
});

test('missing initial position never silently becomes the employee home base',()=>{
 const input=base();input.checkins=input.checkins.filter(e=>e.employeeId!=='a');
 const r=proposeShadowCrewTravel(input)[0];
 assert.equal(r.status,'blocked');
 assert.ok(r.issues.includes('LOCATION_NOT_ATTESTED'));
});

test('another assigned flight cannot double-book a PIC',()=>{
 const input=base();
 input.flights.push(flight('f2','EDAZ','EDDM','2026-11-07T12:30:00Z','2026-11-07T13:10:00Z'));
 input.assignments.push({shadowFlightId:'f2',employeeId:'a',role:'PIC'});
 const r=proposeShadowCrewTravel(input).find(p=>p.flightId==='f1');
 assert.equal(r.status,'blocked');
 assert.ok(r.issues.includes('PRIOR_OR_OVERLAPPING_ASSIGNMENT'));
});

test('11-hour simulated rest starts after last fictional landing and release',()=>{
 const input=base();
 input.movements=[{id:'m1',employeeId:'a',status:'completed_virtual',
  fromIcao:'EDAZ',toIcao:'EDAZ',departedAt:'2026-11-07T07:30:00Z',
  arrivedAt:'2026-11-07T09:30:00Z'}];
 const r=proposeShadowCrewTravel(input)[0];
 assert.equal(r.status,'blocked');
 assert.ok(r.issues.includes('TRAVEL_OR_REST_TIME_INSUFFICIENT'));
});

test('planned ferry is crewed from ferry origin, not from later charter origin',()=>{
 const input=base();input.flights=[flight('f1','EDDB','LFMN','2026-11-07T12:00:00Z','2026-11-07T14:00:00Z')];
 input.positioningLegs=[{shadowFlightId:'f1',status:'planned',
  fromIcao:'EDAZ',toIcao:'EDDB',departureAt:'2026-11-07T10:00:00Z',
  arrivalAt:'2026-11-07T11:00:00Z'}];
 input.checkins=[anchor('a','EDAZ'),anchor('b','EDAZ')];
 const r=proposeShadowCrewTravel(input)[0];
 assert.equal(r.status,'scenario_proposal');
 assert.equal(r.ferry,true);
 assert.equal(r.boardingIcao,'EDAZ');
 assert.equal(r.reportAt,'2026-11-07T09:00:00.000Z');
 assert.equal(r.estimatedCostEur,0);
});

test('Longitude cannot touch EDAZ including ferry and Phenom charter is blocked',()=>{
 const input=base();input.flights[0].aircraftType='Citation Longitude';
 input.positioningLegs=[{shadowFlightId:'f1',status:'planned',
  fromIcao:'EDAZ',toIcao:'EDDB',departureAt:'2026-11-07T10:00:00Z',
  arrivalAt:'2026-11-07T11:00:00Z'}];
 assert.equal(proposeShadowCrewTravel(input)[0].issue,'LONGITUDE_EDAZ_FORBIDDEN');
 input.positioningLegs=[];input.flights[0].aircraftType='Phenom 300E';
 assert.equal(proposeShadowCrewTravel(input)[0].issue,'PHENOM_CHARTER_BLOCKED');
});

test('pending or blocked virtual movement invalidates crew location rather than teleporting',()=>{
 const input=base();input.movements=[{id:'m1',employeeId:'a',
  status:'blocked_wrong_airport',fromIcao:'EDAZ',toIcao:'EDDB',
  departedAt:'2026-11-07T07:10:00Z',arrivedAt:'2026-11-07T07:40:00Z'}];
 assert.ok(proposeShadowCrewTravel(input)[0].issues.includes('MOVEMENT_CHAIN_UNVERIFIED'));
});

test('proposals cannot be issued for a past charter or unknown ferry timing',()=>{
 const input=base();input.flights=[flight('f1','EDDB','LFMN','2026-11-07T08:05:00Z','2026-11-07T10:00:00Z')];
 assert.equal(proposeShadowCrewTravel(input)[0].issue,'SCENARIO_TOO_CLOSE_OR_PAST');
 input.flights=[flight()];input.positioningLegs=[{shadowFlightId:'f1',status:'planned',
  fromIcao:'EDAZ',toIcao:'EDDB',departureAt:null,arrivalAt:null}];
 assert.equal(proposeShadowCrewTravel(input)[0].issue,'FERRY_TIMELINE_INVALID');
});
