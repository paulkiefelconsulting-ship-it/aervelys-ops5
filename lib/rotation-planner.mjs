/** Deterministic rotation proposals; never authorizes flight operations or makes bookings. */
const millis=value=>{const t=Date.parse(value??'');return Number.isFinite(t)?t:NaN;};
const minutes=n=>n*60_000;
const airport=x=>String(x??'').trim().toUpperCase();
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
function routeBetween(routes,from,to){
 if(from===to)return {durationMinutes:0,costEur:0,mode:'none'};
 return routes.find(r=>airport(r.from)===from&&airport(r.to)===to&&positive(r.durationMinutes))??null;
}
function block(code,req,detail){return {requestId:req.id,status:'blocked',code,detail};}
/**
 * Pure simulation of fleet and PIC/SIC allocations. Inputs must contain
 * validated durations, positions, availability and authorizations. No guessed
 * travel time, no teleportation, and no whole-day aircraft reservations.
 */
export function proposeRotations({aircraft=[],crew=[],requests=[],aircraftRoutes=[],crewRoutes=[],commitments=[],turnaroundMinutes=45,crewReportMinutes=60}={}){
 const results=[];
 const state=new Map(aircraft.map(a=>[a.id,{location:airport(a.currentIcao),available:millis(a.availableAt)}]));
 const crewState=new Map(crew.map(p=>[p.id,{location:airport(p.currentIcao),available:millis(p.availableAt),lastDutyEnd:millis(p.lastDutyEnd)}]));
 const provisional=[];
 for(const req of [...requests].sort((a,b)=>millis(a.departsAt)-millis(b.departsAt))){
  const start=millis(req.departsAt),end=millis(req.arrivesAt),from=airport(req.from),to=airport(req.to);
  if(!from||!to||!Number.isFinite(start)||!Number.isFinite(end)||end<=start){
   results.push(block('INVALID_FLIGHT_WINDOW',req,'Abflug, Ankunft und gültiges Zeitfenster erforderlich.'));continue;
  }
  const candidates=[],reasons=new Set();
  for(const a of aircraft){
   const pos=state.get(a.id);
   if(req.aircraftId&&req.aircraftId!==a.id)continue;
   if(a.operationalStatus!=='active'||a.charterReleased!==true){reasons.add('AIRCRAFT_NOT_RELEASED');continue;}
   if(String(a.type).toLowerCase().includes('longitude')&&(from==='EDAZ'||to==='EDAZ')){reasons.add('EDAZ_LONGITUDE_RESTRICTED');continue;}
   if(a.airportPerformanceVerified!==true){reasons.add('AIRPORT_PERFORMANCE_NOT_VERIFIED');continue;}
   if(!pos?.location||!Number.isFinite(pos.available)){reasons.add('AIRCRAFT_POSITION_UNKNOWN');continue;}
   const ferry=routeBetween(aircraftRoutes,pos.location,from);
   if(!ferry){reasons.add('AIRCRAFT_FERRY_ROUTE_UNKNOWN');continue;}
   const ferryEnd=start-minutes(turnaroundMinutes),ferryStart=ferryEnd-minutes(ferry.durationMinutes);
   if(ferryStart<pos.available){reasons.add('AIRCRAFT_POSITIONING_TOO_LATE');continue;}
   const occupied=[...commitments.filter(c=>c.aircraftId===a.id),...provisional.filter(c=>c.aircraftId===a.id)]
    .map(c=>({...c,start:millis(c.startsAt),end:millis(c.endsAt)}));
   if(occupied.some(c=>overlaps({start:ferryStart,end},c))){reasons.add('AIRCRAFT_TIME_CONFLICT');continue;}
   const historical=occupied.some(c=>c.end<=ferryStart&&c.end>pos.available);
   if(historical){reasons.add('PREVIOUS_COMMITMENT_LOCATION_UNVERIFIED');continue;}
   const next=occupied.filter(c=>c.start>=end).sort((x,y)=>x.start-y.start)[0];
   if(next){
    const recovery=routeBetween(aircraftRoutes,to,airport(next.fromIcao));
    if(!recovery||end+minutes(turnaroundMinutes+recovery.durationMinutes)>next.start){
     reasons.add('FOLLOWING_COMMITMENT_UNREACHABLE');continue;
    }
   }
   const suitable=crew.filter(p=>p.verified===true&&p.operationalStatus==='active'
    &&Array.isArray(p.aircraftTypes)&&p.aircraftTypes.includes(a.type));
   const pick=role=>{
    const options=suitable.filter(p=>p.role===role).map(p=>{
     const s=crewState.get(p.id);
     if(!s?.location||!Number.isFinite(s.available))return null;
     const transfer=routeBetween(crewRoutes,s.location,from);
     if(!transfer)return null;
     const report=start-minutes(crewReportMinutes),travelStart=report-minutes(transfer.durationMinutes);
     const earliest=Math.max(s.available,Number.isFinite(s.lastDutyEnd)
      ?s.lastDutyEnd+minutes(Math.max(0,Number(p.minimumRestMinutes??0))):s.available);
     if(travelStart<earliest)return null;
     const busy=[...commitments.filter(c=>c.crewId===p.id),...provisional.filter(c=>c.crewId===p.id)]
      .some(c=>overlaps({start:travelStart,end},{start:millis(c.startsAt),end:millis(c.endsAt)}));
     if(busy)return null;
     const future=commitments.some(c=>c.crewId===p.id&&millis(c.startsAt)>=end);
     if(future)return null; // connection to a subsequent crew duty not verified
     return {person:p,transfer,start:travelStart,report};
    }).filter(Boolean);
    return options.sort((x,y)=>Number(x.transfer.costEur??0)-Number(y.transfer.costEur??0));
   };
   const pics=pick('PIC'),sics=pick('SIC');
   const pairing=pics.flatMap(pic=>sics.filter(sic=>sic.person.id!==pic.person.id).map(sic=>({pic,sic})))
    .sort((x,y)=>Number(x.pic.transfer.costEur??0)+Number(x.sic.transfer.costEur??0)
     -Number(y.pic.transfer.costEur??0)-Number(y.sic.transfer.costEur??0))[0];
   if(!pairing){reasons.add('QUALIFIED_POSITIONED_CREW_UNAVAILABLE');continue;}
   const cost=Number(ferry.costEur??0)+Number(pairing.pic.transfer.costEur??0)+Number(pairing.sic.transfer.costEur??0);
   candidates.push({aircraft:a,positioning:ferry,positioningStart:ferryStart,positioningEnd:ferryEnd,crew:pairing,cost});
  }
  candidates.sort((x,y)=>x.cost-y.cost||x.aircraft.registration.localeCompare(y.aircraft.registration));
  const best=candidates[0];
  if(!best){results.push(block(reasons.size===1?[...reasons][0]:'MULTIPLE_REQUIREMENTS_UNMET',req,
   [...reasons].join(', ')||'Kein passender Flugzeugkandidat.'));continue;}
  const assigned={
   requestId:req.id,status:'proposed',aircraftId:best.aircraft.id,registration:best.aircraft.registration,
   from,to,departsAt:req.departsAt,arrivesAt:req.arrivesAt,
   aircraftPositioning:best.positioning.durationMinutes?{
    from:state.get(best.aircraft.id).location,to:from,
    startsAt:new Date(best.positioningStart).toISOString(),endsAt:new Date(best.positioningEnd).toISOString(),
    costEur:Number(best.positioning.costEur??0)
   }:null,
   crew:[best.crew.pic,best.crew.sic].map(x=>({
    id:x.person.id,role:x.person.role,name:x.person.name,
    positioning:x.transfer.durationMinutes?{
     from:crewState.get(x.person.id).location,to:from,mode:x.transfer.mode??'unknown',
     startsAt:new Date(x.start).toISOString(),endsAt:new Date(x.report).toISOString(),
     costEur:Number(x.transfer.costEur??0)}:null
   })),positioningCostEur:best.cost
  };
  results.push(assigned);
  state.set(best.aircraft.id,{location:to,available:end+minutes(turnaroundMinutes)});
  provisional.push({aircraftId:best.aircraft.id,startsAt:new Date(best.positioningStart).toISOString(),endsAt:req.arrivesAt});
  for(const member of assigned.crew){
   crewState.set(member.id,{location:to,available:end,lastDutyEnd:end});
   provisional.push({crewId:member.id,startsAt:new Date(Math.min(best.crew.pic.start,best.crew.sic.start)).toISOString(),endsAt:req.arrivesAt});
  }
 }
 return results;
}
