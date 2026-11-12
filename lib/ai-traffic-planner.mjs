/**
 * AERVELYS AI traffic projection – PURE planning logic, not a SimConnect client.
 *
 * The world/business simulation is authoritative; MSFS receives only the subset
 * local to the user's position. The adapter must acknowledge SimConnect events
 * and supply observed objects on the next reconciliation.
 *
 * No model, stand, location, takeoff, touchdown or clearance is fabricated here.
 */
const ICAO=/^[A-Z0-9]{4}$/;
const validPoint=p=>p&&typeof p.lat==='number'&&typeof p.lon==='number'
 &&Number.isFinite(p.lat)&&Number.isFinite(p.lon)
 &&p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180;
const icao=s=>String(s??'').trim().toUpperCase();
const upper=s=>String(s??'').trim().toUpperCase();
const nm=(a,b)=>{
 const rad=Math.PI/180;
 const dlat=(Number(b.lat)-Number(a.lat))*rad,dlon=(Number(b.lon)-Number(a.lon))*rad;
 const u=Math.sin(dlat/2)**2+Math.cos(Number(a.lat)*rad)*Math.cos(Number(b.lat)*rad)*Math.sin(dlon/2)**2;
 return (2*6371*Math.atan2(Math.sqrt(u),Math.sqrt(1-u)))/1.852;
};
const activePhases=new Set(['ready','pushback','taxi_out','holding','takeoff','airborne','approach','landing','taxi_in']);
const departPhases=new Set(['ready','pushback','taxi_out','holding','takeoff']);
const movementPhases=new Set(['pushback','taxi_out','holding','takeoff','airborne','approach','landing','taxi_in']);
const issue=(issues,aircraftId,code,detail='')=>issues.push({aircraftId,code,detail});

/**
 * @param {object} args
 * @param {Array} args.aircraft Known aircraft; {id,registration,aiModelTitle,aiLivery?,currentIcao,status}
 * @param {Array} args.operations Active flights; {id,aircraftId,phase,dispatchApproved,planPath}
 * @param {Array} args.liveObjects Objects owned by OUR SimConnect client; {aircraftId,objectId,loadedOperationId?}
 * @param {object} args.airports Trusted airport positions keyed by ICAO, e.g. {EDAZ:{lat,lon}}
 * @param {object} args.observer Current user-aircraft location {lat,lon,aircraftId?,registration?}
 * @returns {{commands:Array,issues:Array,selectedAircraftIds:Array}} Intent only; no writes/side effects.
 */
export function planAiTraffic({aircraft=[],operations=[],liveObjects=[],airports={},observer,
 maxVisible=3,visibleRadiusNm=30}={}){
 const commands=[],issues=[];
 if(!validPoint(observer)){
  issue(issues,null,'OBSERVER_POSITION_MISSING','No AI object is created or removed without a verified observer position.');
  return {commands,issues,selectedAircraftIds:[]};
 }
 if(!Number.isInteger(maxVisible)||maxVisible<0||maxVisible>20||!Number.isFinite(visibleRadiusNm)
  ||visibleRadiusNm<=0||visibleRadiusNm>100){
  issue(issues,null,'INVALID_VISIBILITY_LIMITS');
  return {commands,issues,selectedAircraftIds:[]};
 }
 const objByAircraft=new Map(),duplicateObjects=[];
 for(const o of liveObjects){
  if(!o?.aircraftId||!Number.isInteger(o.objectId)||o.objectId<=0)continue;
  if(objByAircraft.has(o.aircraftId)){duplicateObjects.push(o);continue;}
  objByAircraft.set(o.aircraftId,o);
 }
 for(const o of duplicateObjects)commands.push({type:'removeObject',aircraftId:o.aircraftId,objectId:o.objectId,reason:'DUPLICATE_SIM_OBJECT'});
 const operationsByAircraft=new Map(),conflictIds=new Set();
 for(const o of operations){
  if(!o?.aircraftId||!activePhases.has(o.phase))continue;
  if(operationsByAircraft.has(o.aircraftId))conflictIds.add(o.aircraftId);
  else operationsByAircraft.set(o.aircraftId,o);
 }
 const knownAircraft=new Set(),knownRegistrations=new Set(),candidates=[];
 for(const a of aircraft){
  if(!a?.id)continue;
  if(knownAircraft.has(a.id)){
   issue(issues,a.id,'DUPLICATE_FLEET_ID');continue;
  }
  knownAircraft.add(a.id);
  const object=objByAircraft.get(a.id);
  const remove=reason=>{if(object)commands.push({type:'removeObject',aircraftId:a.id,objectId:object.objectId,reason});};
  const reg=upper(a.registration),userReg=upper(observer.registration);
  if(!reg){issue(issues,a.id,'REGISTRATION_MISSING');remove('REGISTRATION_MISSING');continue;}
  if(knownRegistrations.has(reg)){issue(issues,a.id,'DUPLICATE_REGISTRATION');remove('DUPLICATE_REGISTRATION');continue;}
  knownRegistrations.add(reg);
  if(a.id===observer.aircraftId||(reg&&userReg&&reg===userReg)){
   remove('PLAYER_AIRCRAFT');continue;
  }
  if(conflictIds.has(a.id)){
   issue(issues,a.id,'OVERLAPPING_ACTIVE_OPERATIONS');remove('OPERATION_CONFLICT');continue;
  }
  if(a.status!=='active'){
   remove('AIRCRAFT_NOT_ACTIVE');continue;
  }
  const op=operationsByAircraft.get(a.id);
  // Only a confirmed parked state can create a parked aircraft. Never teleport a jet
  // onto a stand during takeoff, cruise, approach or taxi-in.
  if(!op||op.phase==='ready'){
   const code=icao(a.currentIcao),location=airports[code];
   if(!ICAO.test(code)||!validPoint(location)){
    issue(issues,a.id,'PARKED_LOCATION_NOT_VERIFIED');remove('UNKNOWN_POSITION');continue;
   }
   if(String(a.aircraftType??'').toLowerCase().includes('longitude')&&code==='EDAZ'){
    issue(issues,a.id,'EDAZ_LONGITUDE_RESTRICTED');remove('AIRPORT_RESTRICTION');continue;
   }
   if(!String(a.aiModelTitle??'').trim()){
    issue(issues,a.id,'AI_MODEL_NOT_CONFIGURED');remove('MODEL_UNAVAILABLE');continue;
   }
   const distanceNm=nm(observer,location);
   if(distanceNm>visibleRadiusNm){remove('OUTSIDE_VISIBILITY_RADIUS');continue;}
   candidates.push({a,op,object,distanceNm,kind:'parked',code});
  }else{
   // Moving/airborne entities must be present already and then driven by the
   // Windows SimConnect adapter. New airborne injection is NOT enabled by default.
   if(object){
    candidates.push({a,op,object,distanceNm:0,kind:'ongoing'});
   }else{
    issue(issues,a.id,'IN_FLIGHT_INJECTION_NOT_IMPLEMENTED',
     'Existing AI instance required; mid-flight creation and arrival handling need an on-simulator test.');
   }
  }
 }
 // The low-resource default keeps existing traffic, then selects nearest new jets.
 candidates.sort((x,y)=>Number(Boolean(y.object))-Number(Boolean(x.object))
  ||x.distanceNm-y.distanceNm||String(x.a.id).localeCompare(String(y.a.id)));
 const selected=candidates.slice(0,maxVisible),selectedIds=new Set(selected.map(c=>c.a.id));
 for(const c of candidates.slice(maxVisible)){
  if(c.object)commands.push({type:'removeObject',aircraftId:c.a.id,objectId:c.object.objectId,reason:'VISIBILITY_BUDGET'});
 }
 for(const c of selected){
  if(!c.object){
   commands.push({type:'spawnParked',aircraftId:c.a.id,registration:upper(c.a.registration),
    modelTitle:c.a.aiModelTitle,livery:c.a.aiLivery??'',airportIcao:c.code});
   continue; // set-flight-plan only after SimConnect returns the new object ID.
  }
  if(c.op?.phase==='ready'&&c.op.dispatchApproved===true){
   if(typeof c.op.planPath!=='string'||!c.op.planPath.trim().toLowerCase().endsWith('.pln')){
    issue(issues,c.a.id,'VERIFIED_FLIGHT_PLAN_REQUIRED');continue;
   }
   if(c.object.loadedOperationId!==c.op.id){
    commands.push({type:'setFlightPlan',aircraftId:c.a.id,objectId:c.object.objectId,
     operationId:c.op.id,planPath:c.op.planPath});
   }
  }
 }
 // Clear owned objects whose aircraft ceased to exist in the flight-company snapshot.
 for(const [id,o] of objByAircraft){
  if(!knownAircraft.has(id))commands.push({type:'removeObject',aircraftId:id,objectId:o.objectId,reason:'NO_LONGER_IN_FLEET'});
 }
 return {commands,issues,selectedAircraftIds:[...selectedIds]};
}
export const supportedAiPhases=Object.freeze([...activePhases]);
export const phaseRequiresExistingObject=phase=>movementPhases.has(phase)&&!departPhases.has(phase);
