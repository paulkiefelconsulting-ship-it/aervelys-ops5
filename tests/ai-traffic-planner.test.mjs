import test from 'node:test';
import assert from 'node:assert/strict';
import {planAiTraffic} from '../lib/ai-traffic-planner.mjs';
const fleet=[{id:'da62',registration:'D-AVF62',aircraftType:'DA62',status:'active',aiModelTitle:'DA62 Asobo',currentIcao:'EDAZ'},
 {id:'cj4',registration:'D-AVF04',aircraftType:'CJ4',status:'active',aiModelTitle:'CJ4 Asobo',currentIcao:'EDAZ'}];
const base=()=>({aircraft:fleet,airports:{EDAZ:{lat:52.2031,lon:13.1568}},
 observer:{lat:52.204,lon:13.157,aircraftId:'user'},operations:[],liveObjects:[],maxVisible:3});
const has=(result,type)=>result.commands.filter(c=>c.type===type);
test('renders parked fleet only nearby and does not mutate inputs',()=>{
 const a=base(),snapshot=JSON.stringify(a),r=planAiTraffic(a);
 assert.equal(has(r,'spawnParked').length,2);
 assert.equal(JSON.stringify(a),snapshot);
});
test('removes double of the user aircraft even if its model is otherwise eligible',()=>{
 const a=base();a.observer.registration='D-AVF62';a.liveObjects=[{aircraftId:'da62',objectId:4}];
 const r=planAiTraffic(a);assert.deepEqual(has(r,'removeObject').map(x=>x.objectId),[4]);
 assert.deepEqual(has(r,'spawnParked').map(x=>x.aircraftId),['cj4']);
});
test('authoritative flightplan only when dispatch approved and an AI object exists',()=>{
 const a=base();a.aircraft=[fleet[0]];
 a.operations=[{id:'leg-1',aircraftId:'da62',phase:'ready',dispatchApproved:true,planPath:'C:\\MSFS\\Plans\\leg-1.pln'}];
 assert.deepEqual(has(planAiTraffic(a),'spawnParked').length,1);
 assert.equal(has(planAiTraffic(a),'setFlightPlan').length,0);
 a.liveObjects=[{aircraftId:'da62',objectId:123}];
 const r=planAiTraffic(a);assert.equal(has(r,'setFlightPlan').length,1);
 assert.equal(has(r,'setFlightPlan')[0].objectId,123);
 a.liveObjects[0].loadedOperationId='leg-1';
 assert.equal(has(planAiTraffic(a),'setFlightPlan').length,0);
 a.operations[0].dispatchApproved=false;
 a.liveObjects[0].loadedOperationId=null;
 assert.equal(has(planAiTraffic(a),'setFlightPlan').length,0);
});
test('does not invent in-flight or approach traffic from a schedule',()=>{
 const a=base();a.aircraft=[fleet[0]];a.operations=[{id:'leg-2',aircraftId:'da62',phase:'approach'}];
 const r=planAiTraffic(a);assert.deepEqual(r.commands,[]);
 assert.equal(r.issues[0].code,'IN_FLIGHT_INJECTION_NOT_IMPLEMENTED');
});
test('rejects conflicts and bad parking data, retains no ghost objects',()=>{
 const a=base();a.aircraft=[fleet[0]];a.liveObjects=[{aircraftId:'da62',objectId:9}];
 a.operations=[{id:'a',aircraftId:'da62',phase:'ready'},{id:'b',aircraftId:'da62',phase:'airborne'}];
 let r=planAiTraffic(a);assert.equal(r.issues[0].code,'OVERLAPPING_ACTIVE_OPERATIONS');
 assert.equal(has(r,'removeObject')[0].objectId,9);
 a.operations=[];a.airports={};r=planAiTraffic(a);
 assert.equal(r.issues[0].code,'PARKED_LOCATION_NOT_VERIFIED');
});
test('respects max visible AI aircraft and removes distant ones',()=>{
 const a=base();a.maxVisible=1;a.liveObjects=[{aircraftId:'cj4',objectId:77}];
 let r=planAiTraffic(a);assert.deepEqual(r.selectedAircraftIds,['cj4']);
 a.maxVisible=3;a.observer.lat=48.1;a.observer.lon=11.6;
 r=planAiTraffic(a);assert.equal(has(r,'removeObject')[0].reason,'OUTSIDE_VISIBILITY_RADIUS');
});
test('a longitude cannot be inserted at EDAZ and inactive aircraft are not injected',()=>{
 const a=base();a.aircraft=[{...fleet[0],aircraftType:'Citation Longitude'}];
 assert.equal(planAiTraffic(a).issues[0].code,'EDAZ_LONGITUDE_RESTRICTED');
 a.aircraft=[{...fleet[0],status:'maintenance'}];
 assert.deepEqual(planAiTraffic(a).commands,[]);
});
test('missing observer position is non-destructive even with live objects',()=>{
 const a=base();a.observer=null;a.liveObjects=[{aircraftId:'da62',objectId:4}];
 const r=planAiTraffic(a);assert.deepEqual(r.commands,[]);
 assert.equal(r.issues[0].code,'OBSERVER_POSITION_MISSING');
});
test('cleans up orphans and duplicate AI object IDs',()=>{
 const a=base();a.liveObjects=[{aircraftId:'da62',objectId:3},
  {aircraftId:'da62',objectId:5},{aircraftId:'removed',objectId:6}];
 const r=planAiTraffic(a);
 assert.deepEqual(has(r,'removeObject').map(x=>x.objectId).sort(),[5,6]);
});
test('missing or duplicate registrations do not spawn additional aircraft',()=>{
 const a=base();a.aircraft=[fleet[0],{...fleet[1],registration:'D-AVF62'}];
 let r=planAiTraffic(a);assert.equal(has(r,'spawnParked').length,1);
 assert.equal(r.issues[0].code,'DUPLICATE_REGISTRATION');
 a.aircraft=[{...fleet[0],registration:''}];r=planAiTraffic(a);
 assert.equal(r.issues[0].code,'REGISTRATION_MISSING');
});
test('null position coordinates are rejected rather than becoming 0,0',()=>{
 const a=base();a.observer={lat:null,lon:null};
 assert.equal(planAiTraffic(a).issues[0].code,'OBSERVER_POSITION_MISSING');
});
