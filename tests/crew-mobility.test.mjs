import test from 'node:test';
import assert from 'node:assert/strict';
import {planCrewMobility} from '../lib/crew-mobility-planner.mjs';

const person=()=>({
 id:'pic-1',name:'Test Captain',role:'PIC',homeBaseIcao:'EDAZ',
 currentIcao:'EDAZ',locationVerified:true,
 availableAt:'2026-11-05T05:00:00Z',
 lastDutyEnd:'2026-11-04T16:00:00Z',historyVerified:true,minimumRestMinutes:660
});
const duty=(id,startsAt,endsAt,fromIcao,toIcao)=>({
 id,employeeId:'pic-1',kind:'flight',startsAt,endsAt,fromIcao,toIcao
});
test('verified crew transfer arrives before report, does not teleport, records cost',()=>{
 const result=planCrewMobility({people:[person()],
  duties:[duty('f1','2026-11-05T08:00:00Z','2026-11-05T09:10:00Z','EDDB','EDDM')],
  travelRoutes:[{from:'EDAZ',to:'EDDB',durationMinutes:40,costEur:85,mode:'shuttle',verified:true}],
  reportMinutes:45,releaseMinutes:30
 })[0];
 assert.equal(result.status,'mobility_review_only');
 assert.equal(result.transfers.length,1);
 assert.deepEqual([result.transfers[0].startsAt,result.transfers[0].endsAt],
  ['2026-11-05T06:35:00.000Z','2026-11-05T07:15:00.000Z']);
 assert.equal(result.transfers[0].costEur,85);
 assert.equal(result.projectedEndIcao,'EDDM');
 assert.equal(result.estimatedTravelAndHotelEur,85);
 assert.equal(result.returnSuggestion,null); // no guess when no verified return route
});
test('multi-day duty chain costs a real supplied hotel rate and offers optional return',()=>{
 const p=person();p.homeBaseIcao='EDDB';p.currentIcao='EDDB';
 const a=duty('f1','2026-11-05T08:00:00Z','2026-11-05T10:00:00Z','EDDB','LFMN');
 const b=duty('f2','2026-11-06T10:00:00Z','2026-11-06T11:00:00Z','LFMN','LSZH');
 const x=planCrewMobility({people:[p],duties:[b,a],
  hotels:[{airportIcao:'LFMN',rateEurPerNight:140,verified:true}],
  travelRoutes:[{from:'LSZH',to:'EDDB',mode:'line',durationMinutes:115,costEur:240,verified:true}]
 })[0];
 assert.equal(x.status,'mobility_review_only');
 assert.equal(x.stays[0].nights,1);
 assert.equal(x.stays[0].costEur,140);
 assert.equal(x.estimatedTravelAndHotelEur,140);
 assert.equal(x.projectedEndIcao,'LSZH');
 assert.equal(x.returnSuggestion?.costEur,240);
 assert.equal(x.returnSuggestion?.status,'optional_not_booked');
});
test('missing transfer is a hard blocker and not a zero-time travel assumption',()=>{
 const d=duty('f1','2026-11-05T08:00:00Z','2026-11-05T09:10:00Z','EDDB','EDDM');
 const x=planCrewMobility({people:[person()],duties:[d]})[0];
 assert.equal(x.status,'blocked');
 assert.ok(x.issues.some(i=>i.code==='TRANSFER_ROUTE_UNVERIFIED'));
 assert.equal(x.projectedEndIcao,null);
});
test('unverified staff location cannot be substituted with homebase',()=>{
 const p=person();p.currentIcao=null;p.locationVerified=false;
 const x=planCrewMobility({people:[p],duties:[duty('f1','2026-11-05T08:00:00Z','2026-11-05T09:10:00Z','EDAZ','EDDM')]})[0];
 assert.ok(x.issues.some(i=>i.code==='CURRENT_LOCATION_UNVERIFIED'));
 assert.ok(x.issues.some(i=>i.code==='TRAVEL_ORIGIN_UNKNOWN'));
 assert.equal(x.status,'blocked');
});
test('rest is required before second assignment and positioning cannot consume it',()=>{
 const p=person();
 const x=planCrewMobility({people:[p],duties:[
  duty('f1','2026-11-05T08:00:00Z','2026-11-05T10:00:00Z','EDAZ','EDDB'),
  duty('f2','2026-11-05T16:00:00Z','2026-11-05T17:00:00Z','EDDB','EDDM')
 ]})[0];
 assert.equal(x.status,'blocked');
 assert.ok(x.issues.some(i=>i.code==='TRANSFER_TIME_OR_REST_INSUFFICIENT'));
});
test('hotel rates and availability are not invented',()=>{
 const p=person();p.currentIcao='EDDB';p.homeBaseIcao='EDAZ';
 const x=planCrewMobility({people:[p],duties:[
  duty('f1','2026-11-05T08:00:00Z','2026-11-05T10:00:00Z','EDDB','LFMN'),
  duty('f2','2026-11-06T10:00:00Z','2026-11-06T11:00:00Z','LFMN','LSZH')
 ]})[0];
 assert.equal(x.estimatedTravelAndHotelEur,null);
 assert.ok(x.issues.some(i=>i.code==='HOTEL_RATE_OR_AVAILABILITY_UNVERIFIED'));
});
test('overlapping duties are flagged even with the same crew position',()=>{
 const x=planCrewMobility({people:[person()],duties:[
  duty('f1','2026-11-05T08:00:00Z','2026-11-05T11:00:00Z','EDAZ','EDAZ'),
  duty('f2','2026-11-05T10:00:00Z','2026-11-05T12:00:00Z','EDAZ','EDAZ')
 ]})[0];
 assert.ok(x.issues.some(i=>i.code==='DUTY_OVERLAP'));
});
test('unverified minimum rest and invalid travel time block without fallback',()=>{
 const p=person();delete p.minimumRestMinutes;
 const x=planCrewMobility({people:[p],duties:[]})[0];
 assert.ok(x.issues.some(i=>i.code==='DUTY_HISTORY_OR_REST_RULE_UNVERIFIED'));
 const y=planCrewMobility({people:[person()],
  duties:[duty('f1','2026-11-05T08:00:00Z','2026-11-05T10:00:00Z','EDDB','EDAZ')],
  travelRoutes:[{from:'EDAZ',to:'EDDB',durationMinutes:-10,costEur:0,mode:'shuttle',verified:true}]
 })[0];
 assert.equal(y.status,'blocked');
});
