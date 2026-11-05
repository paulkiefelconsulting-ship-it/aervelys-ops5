/**
 * AERVELYS Crew Location Ledger
 * Pure projection of append-only, evidenced events. Never grants dispatch,
 * creates travel bookings or treats a home base as the current crew location.
 */
const time=value=>typeof value==='string'&&value.trim()?Date.parse(value):NaN;
const icao=value=>typeof value==='string'?value.trim().toUpperCase():'';
const validIcao=value=>/^[A-Z0-9]{4}$/.test(icao(value));
const validMinuteLimit=value=>Number.isFinite(value)&&value>=0;

export function projectCrewLocations({
 people=[],events=[],asOf=new Date().toISOString(),maxAgeMinutes=7*24*60
}={}){
 const now=time(asOf);
 if(!Number.isFinite(now))throw new TypeError('Valid asOf time required');
 if(!validMinuteLimit(maxAgeMinutes))throw new TypeError('Invalid maximum event age');
 return people.map(person=>{
  const relevant=events.filter(e=>e.employeeId===person.id)
   .sort((a,b)=>time(a.occurredAt)-time(b.occurredAt)||
     time(a.recordedAt)-time(b.recordedAt)||
     String(a.id).localeCompare(String(b.id)));
  let location=null,confirmedAt=null,lastEventAt=null,lastSource=null;
  let status='unknown',lastReason='NO_VERIFIED_LOCATION',lastEventId=null;
  const history=[];
  for(const e of relevant){
   const instant=time(e.occurredAt);
   if(!Number.isFinite(instant)||instant>now){
    history.push({id:e.id,result:'ignored',reason:'INVALID_OR_FUTURE_EVENT'});continue;
   }
   lastEventAt=new Date(instant).toISOString();
   lastEventId=e.id;
   const place=icao(e.locationIcao),origin=icao(e.originIcao);
   const kind=String(e.eventType??'');
   const verified=e.verificationState==='verified'&&
    typeof e.sourceReference==='string'&&e.sourceReference.trim().length>0 &&
    Number.isFinite(time(e.verifiedAt))&&time(e.verifiedAt)<=now&&time(e.verifiedAt)>=instant;
   if(kind==='location_unknown'){
    location=null;confirmedAt=null;status='unknown';lastReason='POSITION_REVOKED';
    history.push({id:e.id,result:'invalidated',reason:lastReason});continue;
   }
   if(!verified){
    location=null;confirmedAt=null;status='blocked';lastReason='LATEST_MOVEMENT_UNVERIFIED';
    history.push({id:e.id,result:'blocked',reason:lastReason});continue;
   }
   if(!validIcao(place)){
    location=null;confirmedAt=null;status='blocked';lastReason='DESTINATION_INVALID';
    history.push({id:e.id,result:'blocked',reason:lastReason});continue;
   }
   if(kind==='check_in'){
    // A new check-in is an initial anchor or confirmation at the SAME place.
    // It cannot teleport someone whose last position was elsewhere.
    if(location&&location!==place){
     location=null;confirmedAt=null;status='blocked';lastReason='UNEXPLAINED_LOCATION_CHANGE';
     history.push({id:e.id,result:'blocked',reason:lastReason});continue;
    }
   }else if(kind==='flight_arrival'||kind==='transfer_arrival'){
    const left=time(e.departedAt);
    if(!validIcao(origin)||!location||origin!==location||
       !Number.isFinite(left)||left>instant||
       !Number.isFinite(time(confirmedAt))||left<time(confirmedAt)){
     location=null;confirmedAt=null;status='blocked';lastReason='MOVEMENT_CHAIN_BROKEN';
     history.push({id:e.id,result:'blocked',reason:lastReason});continue;
    }
   }else{
    location=null;confirmedAt=null;status='blocked';lastReason='UNKNOWN_EVENT_KIND';
    history.push({id:e.id,result:'blocked',reason:lastReason});continue;
   }
   location=place;confirmedAt=new Date(instant).toISOString();
   lastSource=e.sourceReference;status='verified';lastReason='VERIFIED_CHAIN';
   history.push({id:e.id,result:'accepted',reason:lastReason});
  }
  if(status==='verified'&&now-time(confirmedAt)>maxAgeMinutes*60000){
   status='stale';lastReason='LOCATION_TOO_OLD';
  }
  return {
   employeeId:person.id,name:person.name??'',role:person.role??'',
   homeBaseIcao:validIcao(person.homeBaseIcao)?icao(person.homeBaseIcao):null,
   status,locationIcao:status==='verified'?location:null,
   lastEvidenceIcao:location,verifiedAt:confirmedAt,sourceReference:lastSource,
   lastEventAt,lastEventId,reason:lastReason,eventsEvaluated:history.length,history
  };
 });
}

/**
 * Serialises proposed completion evidence but never appends it automatically.
 * Actual airline-like location changes must come from verified completion
 * events, not tentative charter schedules or shadow-only flights.
 */
export function draftCrewArrivalEvent({
 employeeId,fromIcao,toIcao,departedAt,arrivedAt,kind,sourceReference
}={}){
 const departure=time(departedAt),arrival=time(arrivedAt);
 if(!employeeId||!validIcao(fromIcao)||!validIcao(toIcao)||
    !['flight_arrival','transfer_arrival'].includes(kind)||
    !Number.isFinite(departure)||!Number.isFinite(arrival)||arrival<=departure||
    typeof sourceReference!=='string'||!sourceReference.trim()){
  return {status:'blocked',reason:'ARRIVAL_EVIDENCE_INCOMPLETE'};
 }
 return {
  status:'draft_only',employeeId,eventType:kind,originIcao:icao(fromIcao),
  locationIcao:icao(toIcao),departedAt:new Date(departure).toISOString(),
  occurredAt:new Date(arrival).toISOString(),sourceReference,
  verificationState:'pending' // Never implicitly mark a flight or transfer verified
 };
}
