/** AERVELYS Crew Mobility: deterministic read-only planning, NOT an EASA FTL or flight release. */
const MS = 60_000;
const DAY = 86_400_000;
const t = value => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
const icao = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const intersects = (a, b) => a.start < b.end && b.start < a.end;
const overnightCount = (start, end) => Math.max(0, Math.floor((end - 1) / DAY) - Math.floor(start / DAY));
const flightKind = kind => ['flight', 'ferry', 'positioning'].includes(kind);
const movementKind = kind => ['flight', 'ferry', 'positioning', 'standby', 'training', 'ground', 'briefing'].includes(kind);

function issue(code, dutyId = null) {
 return {code, dutyId};
}
function verifiedRoutes(routes, from, to) {
 if(from === to) return [{from, to, mode:'onsite', durationMinutes:0, costEur:0, verified:true}];
 return routes.filter(r => icao(r.from) === from && icao(r.to) === to &&
  r.verified === true && typeof r.mode === 'string' && r.mode.length > 0 &&
  finiteNonnegative(r.durationMinutes) && r.durationMinutes > 0 && finiteNonnegative(r.costEur))
  .sort((a,b) => a.costEur-b.costEur || a.durationMinutes-b.durationMinutes);
}
/**
 * Duty / travel / hotel assessment for a fictional airline.
 *
 * Assumes every duty is one booked working period unless periods share an explicit
 * dutyPeriodId. Real-world regulatory legality requires separate verified FTL checks.
 * No route, position or price is guessed. No database or external action is invoked.
 */
export function planCrewMobility({
 people=[], duties=[], travelRoutes=[], hotels=[], reportMinutes=45, releaseMinutes=30
}={}) {
 if(!finiteNonnegative(reportMinutes)||!finiteNonnegative(releaseMinutes))
  throw new TypeError('Report/release buffers must be nonnegative minutes');
 return people.map(person => {
  const errors=[],transfers=[],stays=[],details=[];
  const movements = duties.filter(d => d.employeeId === person.id)
   .sort((a,b) => t(a.startsAt)-t(b.startsAt) || String(a.id).localeCompare(String(b.id)));
  let position=icao(person.currentIcao), readyAt=t(person.availableAt);
  let lastDutyEnd=t(person.lastDutyEnd), lastPeriod=null, previousSpan=null;
  let cost=0, costUnverified=false;
  if(person.locationVerified !== true || !position || !Number.isFinite(readyAt))
   errors.push(issue('CURRENT_LOCATION_UNVERIFIED'));
  if(person.historyVerified !== true || !finiteNonnegative(person.minimumRestMinutes))
   errors.push(issue('DUTY_HISTORY_OR_REST_RULE_UNVERIFIED'));
  for(const duty of movements) {
   const start=t(duty.startsAt),end=t(duty.endsAt),kind=String(duty.kind??'').toLowerCase();
   const from=icao(duty.fromIcao),to=icao(duty.toIcao);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){
    errors.push(issue('DUTY_TIME_INVALID',duty.id));continue;
   }
   const period=duty.dutyPeriodId || duty.id;
   if(previousSpan && intersects({start,end},previousSpan))
    errors.push(issue('DUTY_OVERLAP',duty.id));
   previousSpan={start,end};
   const passive = ['leave','rest'].includes(kind);
   if(!passive && !movementKind(kind)){
    errors.push(issue('DUTY_KIND_UNKNOWN',duty.id));continue;
   }
   if(passive){
    if(readyAt>start)errors.push(issue('ABSENCE_OR_REST_OVERLAP',duty.id));
    readyAt=Math.max(readyAt||0,end);
    lastPeriod=null;
    details.push({id:duty.id,kind,startsAt:duty.startsAt,endsAt:duty.endsAt,fromIcao:from||null,toIcao:null});
    continue;
   }
   if(!from || (flightKind(kind)&&!to)){
    errors.push(issue('DUTY_AIRPORT_UNKNOWN',duty.id));continue;
   }
   const reportAt=start-(flightKind(kind)?reportMinutes*MS:0);
   const releaseAt=end+(flightKind(kind)?releaseMinutes*MS:0);
   const restReady=Number.isFinite(lastDutyEnd) && lastPeriod !== period &&
    finiteNonnegative(person.minimumRestMinutes) ?
    lastDutyEnd+person.minimumRestMinutes*MS : -Infinity;
   const earliest=Math.max(Number.isFinite(readyAt)?readyAt:Infinity,restReady);
   if(!position || person.locationVerified !== true || !Number.isFinite(readyAt)){
    errors.push(issue('TRAVEL_ORIGIN_UNKNOWN',duty.id));continue;
   }
   const allRoutes=verifiedRoutes(travelRoutes,position,from);
   if(!allRoutes.length){errors.push(issue('TRANSFER_ROUTE_UNVERIFIED',duty.id));continue;}
   // Choose the cheapest *feasible* verified option, never assume transfer travel is instantaneous.
   const suitable=allRoutes.filter(r => reportAt-r.durationMinutes*MS>=earliest);
   if(!suitable.length){errors.push(issue('TRANSFER_TIME_OR_REST_INSUFFICIENT',duty.id));continue;}
   const option=suitable[0];
   const transferStart=reportAt-option.durationMinutes*MS;
   if(Number.isFinite(lastDutyEnd)&&lastPeriod!==period&&
      (!finiteNonnegative(person.minimumRestMinutes) ||
       transferStart < lastDutyEnd + person.minimumRestMinutes*MS)){
    errors.push(issue('REST_BEFORE_POSITIONING_UNVERIFIED',duty.id));continue;
   }
   // Hotel planning is explicit and priced only with a verified catalog rate.
   if(Number.isFinite(lastDutyEnd) && lastDutyEnd<transferStart && position &&
      position!==icao(person.homeBaseIcao)){
    const nights=overnightCount(lastDutyEnd,transferStart);
    if(nights>0){
     const hotel=hotels.find(h=>icao(h.airportIcao)===position &&
       h.verified===true && finiteNonnegative(h.rateEurPerNight));
     if(!hotel){
      errors.push(issue('HOTEL_RATE_OR_AVAILABILITY_UNVERIFIED',duty.id));
      costUnverified=true;
     } else {
      const amount=nights*hotel.rateEurPerNight;
      cost+=amount;
      stays.push({beforeDutyId:duty.id,airportIcao:position,nights,
       rateEurPerNight:hotel.rateEurPerNight,costEur:amount,status:'estimate_not_booked'});
     }
    }
   }
   if(option.durationMinutes>0){
    cost+=option.costEur;
    transfers.push({beforeDutyId:duty.id,fromIcao:position,toIcao:from,
     mode:option.mode,startsAt:new Date(transferStart).toISOString(),
     endsAt:new Date(reportAt).toISOString(),costEur:option.costEur,
     status:'estimate_not_booked'});
   }
   details.push({id:duty.id,kind,startsAt:duty.startsAt,endsAt:duty.endsAt,
    reportAt:new Date(reportAt).toISOString(),releaseAt:new Date(releaseAt).toISOString(),
    fromIcao:from,toIcao:flightKind(kind)?to:from});
   position=flightKind(kind)?to:from;
   readyAt=releaseAt;
   lastDutyEnd=releaseAt;
   lastPeriod=period;
  }
  const home=icao(person.homeBaseIcao);
  let returnSuggestion=null;
  if(position&&home&&home!==position){
   const option=verifiedRoutes(travelRoutes,position,home)[0];
   if(option){
    returnSuggestion={fromIcao:position,toIcao:home,mode:option.mode,
     durationMinutes:option.durationMinutes,costEur:option.costEur,status:'optional_not_booked'};
   }
  }
  return {
   employeeId:person.id,name:person.name??'',role:person.role??'',
   homeBaseIcao:home||null,lastVerifiedIcao:person.locationVerified===true?icao(person.currentIcao):null,
   projectedEndIcao:errors.some(e=>['CURRENT_LOCATION_UNVERIFIED','TRAVEL_ORIGIN_UNKNOWN',
    'TRANSFER_ROUTE_UNVERIFIED','TRANSFER_TIME_OR_REST_INSUFFICIENT','DUTY_AIRPORT_UNKNOWN'].includes(e.code))
    ?null:position||null,
   status:errors.length?'blocked':'mobility_review_only',
   dutyCount:movements.length,details,transfers,stays,issues:errors,
   estimatedTravelAndHotelEur:costUnverified?null:cost,returnSuggestion
  };
 });
}
