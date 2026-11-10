/**
 * AERVELYS virtual Crew Travel Planner.
 * Generates read-only scenario suggestions from explicitly owner-entered fictional
 * travel assumptions. NEVER books travel, releases crew, or updates any position.
 */
const MS=60_000;
const TIME=s=>typeof s==='string'&&s.trim()?Date.parse(s):NaN;
const ICAO=s=>String(s??'').trim().toUpperCase();
const isIcao=s=>/^[A-Z0-9]{4}$/.test(ICAO(s));
const validRoute=r=>isIcao(r.fromIcao)&&isIcao(r.toIcao)&&ICAO(r.fromIcao)!==ICAO(r.toIcao)
 &&['shuttle','rail','airline'].includes(r.mode)
 &&Number.isInteger(Number(r.durationMinutes))&&Number(r.durationMinutes)>=5
 &&Number(r.durationMinutes)<=4320
 &&Number.isFinite(Number(r.costEur))&&Number(r.costEur)>=0
 &&r.simulationOnly===true;
const asISO=n=>new Date(n).toISOString();
const overlap=(a,b,c,d)=>a<d&&c<b;
const unique=arr=>[...new Set(arr)];

function currentVirtualPlace(person,checkins,movements,now,maxAgeMinutes){
 const anchors=checkins.filter(e=>e.employeeId===person.id
  &&e.eventType==='check_in'&&e.verificationState==='verified'
  &&e.sourceReference==='owner_manual_initial_checkin'
  &&isIcao(e.locationIcao)&&Number.isFinite(TIME(e.occurredAt))
  &&TIME(e.occurredAt)<=now).sort((a,b)=>TIME(a.occurredAt)-TIME(b.occurredAt));
 if(anchors.length!==1)return {status:'LOCATION_NOT_ATTESTED'};
 let place=ICAO(anchors[0].locationIcao),observedAt=TIME(anchors[0].occurredAt),lastDutyEnd=null;
 let lastMovementKind='owner_initial_checkin';
 const movementEvents=movements.filter(e=>e.employeeId===person.id
  &&Number.isFinite(TIME(e.arrivedAt))&&TIME(e.arrivedAt)<=now)
  .sort((a,b)=>TIME(a.arrivedAt)-TIME(b.arrivedAt)||String(a.id).localeCompare(String(b.id)));
 for(const event of movementEvents){
  const left=TIME(event.departedAt),arrived=TIME(event.arrivedAt);
  if(event.status!=='completed_virtual' ||
   !Number.isFinite(left)||left<observedAt||left>=arrived||
   ICAO(event.fromIcao)!==place||!isIcao(event.toIcao))
   return {status:'MOVEMENT_CHAIN_UNVERIFIED'};
  place=ICAO(event.toIcao);
  observedAt=arrived;
  lastMovementKind=event.sourceKind??'unknown';
  // A completed ground transfer proves the fictional arrival, but is NOT a new
  // flight-duty landing that restarts the 11h30 post-flight recovery clock.
  // Missing/unknown provenance remains conservative and counts as a duty.
  if(lastMovementKind!=='ground')lastDutyEnd=arrived;
 }
 if(observedAt>now||now-observedAt>maxAgeMinutes*MS)return {status:'LOCATION_EVIDENCE_STALE'};
 return {status:'known',place,observedAt,lastDutyEnd,lastMovementKind};
}

/** Enumerate one direct or a one-connection chain; routes are directional. */
export function listCrewItineraries(from,to,catalog,connectionMinutes=45){
 const source=ICAO(from),target=ICAO(to);
 if(!isIcao(source)||!isIcao(target))return [];
 if(source===target)return [{legs:[],durationMinutes:0,costEur:0,mode:'onsite'}];
 const routes=catalog.filter(validRoute).map(r=>({
  id:String(r.id),fromIcao:ICAO(r.fromIcao),toIcao:ICAO(r.toIcao),
  mode:r.mode,durationMinutes:Number(r.durationMinutes),costEur:Number(r.costEur)
 }));
 const result=[];
 for(const first of routes.filter(r=>r.fromIcao===source)){
  if(first.toIcao===target)result.push({
   legs:[first],durationMinutes:first.durationMinutes,costEur:first.costEur,
   mode:first.mode
  });
  for(const second of routes.filter(r=>r.fromIcao===first.toIcao&&r.toIcao===target)){
   if(first.toIcao===target||second.toIcao===source)continue;
   result.push({
    legs:[first,second],durationMinutes:first.durationMinutes+connectionMinutes+second.durationMinutes,
    costEur:first.costEur+second.costEur,
    mode:first.mode+' + '+second.mode
   });
  }
 }
 return result.sort((a,b)=>a.costEur-b.costEur||
   a.durationMinutes-b.durationMinutes||
   a.legs.map(x=>x.id).join(',').localeCompare(b.legs.map(x=>x.id).join(',')));
}

function flightDuty(flight,positioningLegs,reportMinutes){
 const dep=TIME(flight.departureAt),arr=TIME(flight.arrivalAt);
 if(!isIcao(flight.departureIcao)||!isIcao(flight.arrivalIcao)||
  !Number.isFinite(dep)||!Number.isFinite(arr)||arr<=dep)
  return {error:'FLIGHT_WINDOW_INVALID'};
 const related=positioningLegs.filter(p=>p.shadowFlightId===flight.id);
 if(related.length>1)return {error:'MULTIPLE_FERRY_LEGS_UNSUPPORTED'};
 const ferry=related[0];
 if(ferry && ['blocked_route','blocked_time','blocked_busy','blocked_maintenance'].includes(ferry.status))
  return {error:'FERRY_BLOCKED'};
 if(ferry&&['planned','enroute'].includes(ferry.status)){
  const start=TIME(ferry.departureAt),end=TIME(ferry.arrivalAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>dep||
   ICAO(ferry.toIcao)!==ICAO(flight.departureIcao)||!isIcao(ferry.fromIcao))
   return {error:'FERRY_TIMELINE_INVALID'};
  // Ferry crew must report at the ferry origin, not at charter origin.
  return {reportAt:start-reportMinutes*MS,boardingAt:start,boardingIcao:ICAO(ferry.fromIcao),endAt:arr,ferry:true};
 }
 return {reportAt:dep-reportMinutes*MS,boardingAt:dep,
  boardingIcao:ICAO(flight.departureIcao),endAt:arr,ferry:false};
}

function candidateFor(person,role,flight,duty,context){
 const loc=currentVirtualPlace(person,context.checkins,context.movements,context.now,context.maxAgeMinutes);
 if(loc.status!=='known')return {id:person.id,name:person.name,role,issue:loc.status};
 const earliest=Math.max(context.now,loc.observedAt,
  loc.lastDutyEnd===null?-Infinity:loc.lastDutyEnd+(context.releaseMinutes+context.minRestMinutes)*MS);
 const same=person.id;
 // Future assignments must not be guessed as having already been flown.
 for(const assigned of context.assignments.filter(a=>a.employeeId===same&&a.shadowFlightId!==flight.id)){
  const other=context.flightById.get(assigned.shadowFlightId);
  if(!other) return {id:same,name:person.name,role,issue:'OTHER_ASSIGNMENT_UNKNOWN'};
  const from=TIME(other.departureAt)-context.reportMinutes*MS;
  const until=TIME(other.arrivalAt)+context.releaseMinutes*MS;
  if(!Number.isFinite(from)||!Number.isFinite(until))
   return {id:same,name:person.name,role,issue:'OTHER_ASSIGNMENT_UNKNOWN'};
  if(from<duty.endAt+context.releaseMinutes*MS && until>context.now)
   return {id:same,name:person.name,role,issue:'PRIOR_OR_OVERLAPPING_ASSIGNMENT'};
 }
 const journeys=listCrewItineraries(loc.place,duty.boardingIcao,
  context.routes,context.connectionMinutes);
 if(!journeys.length)return {id:same,name:person.name,role,issue:'TRAVEL_ROUTE_MISSING',fromIcao:loc.place};
 const feasible=journeys.find(x=>{
  const moveStart=duty.reportAt-x.durationMinutes*MS;
  if(moveStart<earliest)return false;
  // A crew trip cannot overlap with another assigned scenario.
  return !context.assignments.some(a=>{
   if(a.employeeId!==same||a.shadowFlightId===flight.id)return false;
   const f=context.flightById.get(a.shadowFlightId);
   if(!f)return true;
   return overlap(moveStart,duty.endAt+context.releaseMinutes*MS,
    TIME(f.departureAt)-context.reportMinutes*MS,
    TIME(f.arrivalAt)+context.releaseMinutes*MS);
  });
 });
 if(!feasible)return {id:same,name:person.name,role,issue:'TRAVEL_OR_REST_TIME_INSUFFICIENT',
  fromIcao:loc.place};
 const startsAt=duty.reportAt-feasible.durationMinutes*MS;
 const steps=[];
 let cursor=startsAt;
 for(const [i,leg] of feasible.legs.entries()){
  const departAt=cursor,arriveAt=cursor+leg.durationMinutes*MS;
  steps.push({routeId:leg.id,mode:leg.mode,fromIcao:leg.fromIcao,toIcao:leg.toIcao,
   startsAt:asISO(departAt),endsAt:asISO(arriveAt),costEur:leg.costEur});
  cursor=arriveAt+(i<feasible.legs.length-1?context.connectionMinutes*MS:0);
 }
 return {
  id:same,name:person.name,role,issue:null,fromIcao:loc.place,toIcao:duty.boardingIcao,
  travelMinutes:feasible.durationMinutes,costEur:feasible.costEur,steps,
  startsAt:asISO(startsAt),reportAt:asISO(duty.reportAt),
  restRule:'SIMULATION_MINIMUM_'+context.minRestMinutes+'_MINUTES',
  locationEvidence:loc.lastMovementKind,
  qualificationStatus:'UNVERIFIED_SIMULATION_ONLY'
 };
}

/**
 * Automatic recommendations only: never books a ticket, assigns PIC/SIC,
 * treats draft type ratings as valid, or writes a flight/crew movement.
 */
export function proposeShadowCrewTravel({
 people=[],flights=[],assignments=[],checkins=[],movements=[],
 routes=[],positioningLegs=[],asOf=new Date().toISOString(),
 reportMinutes=60,releaseMinutes=30,minRestMinutes=660,
 connectionMinutes=45,maxAgeMinutes=10080
}={}){
 const now=TIME(asOf);
 if(!Number.isFinite(now)||[reportMinutes,releaseMinutes,minRestMinutes,connectionMinutes,maxAgeMinutes]
  .some(x=>!Number.isFinite(x)||x<0))
  throw new TypeError('Invalid time or planning parameters');
 const flightById=new Map(flights.map(f=>[f.id,f]));
 const context={now,reportMinutes,releaseMinutes,minRestMinutes,connectionMinutes,
  maxAgeMinutes,flightById,assignments,checkins,movements,routes};
 return [...flights].filter(f=>f.status==='planned').sort((a,b)=>TIME(a.departureAt)-TIME(b.departureAt)).map(f=>{
  const duty=flightDuty(f,positioningLegs,reportMinutes);
  const aircraftType=String(f.aircraftType??'').toLowerCase();
  const fleetBlocked=(aircraftType.includes('longitude')&&(
   ICAO(f.departureIcao)==='EDAZ'||ICAO(f.arrivalIcao)==='EDAZ'
   ||positioningLegs.some(p=>p.shadowFlightId===f.id&&
    (ICAO(p.fromIcao)==='EDAZ'||ICAO(p.toIcao)==='EDAZ'))))
   ?'LONGITUDE_EDAZ_FORBIDDEN'
   :aircraftType.includes('phenom 300e')?'PHENOM_CHARTER_BLOCKED':null;
  const invalid=duty.error||fleetBlocked||(
   !Number.isFinite(TIME(f.departureAt))||TIME(f.departureAt)<now+10*MS?
   'SCENARIO_TOO_CLOSE_OR_PAST':null);
  if(invalid)return {flightId:f.id,status:'blocked',issue:invalid,pic:null,sic:null,candidates:{PIC:[],SIC:[]}};
  const candidates={PIC:[],SIC:[]};
  for(const role of ['PIC','SIC']){
   const existing=assignments.find(a=>a.shadowFlightId===f.id&&a.role===role);
   const eligible=people.filter(p=>p.role===role&&(!existing||existing.employeeId===p.id));
   candidates[role]=eligible.map(p=>candidateFor(p,role,f,duty,context))
    .sort((a,b)=>(a.issue?1:0)-(b.issue?1:0)||
     (a.costEur??Infinity)-(b.costEur??Infinity)||a.name.localeCompare(b.name));
  }
  const pic=candidates.PIC.find(p=>!p.issue);
  const sic=candidates.SIC.find(p=>!p.issue&&p.id!==pic?.id);
  const issues=unique(['PIC','SIC'].flatMap(role=>candidates[role].filter(c=>c.issue).map(c=>c.issue)));
  const status=pic&&sic?'scenario_proposal':'blocked';
  return {flightId:f.id,status,issue:status==='blocked'?issues[0]??'CREW_PAIR_UNAVAILABLE':null,
   pic:pic??null,sic:sic??null,estimatedCostEur:pic&&sic?pic.costEur+sic.costEur:null,
   boardingIcao:duty.boardingIcao,reportAt:asISO(duty.reportAt),ferry:duty.ferry,
   candidates,issues};
 });
}
