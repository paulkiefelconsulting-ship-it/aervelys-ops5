/**
 * AERVELYS read-only rotation continuity audit.
 * No inferred ferry timings, no position updates, no operational dispatch.
 * Each aircraft is evaluated against its known latest location and scheduled
 * draft legs. A missing full context is explicitly reported as unverified.
 */
/**
 * @param {{
 * aircraft?: Array<{id:string,registration:string,aircraft_type:string,current_icao:string|null,operational_status:string}>,
 * flights?: Array<{id:string,aircraft_id:string|null,departure_icao:string,arrival_icao:string,departure_at:string,arrival_at:string,status:string}>,
 * reservations?: Array<{id:string,aircraft_id:string,starts_at:string,ends_at:string,state:string}>,
 * minTurnMinutes?:number,
 * dataComplete?:boolean
 * }} [input]
 */
export function auditRotations({aircraft=[],flights=[],reservations=[],minTurnMinutes=45,dataComplete=true}={}){
 const minutes=Number(minTurnMinutes)*60_000;
 if(!Number.isFinite(minutes)||minutes<0)throw new RangeError('Invalid turnaround');
 const fmt=x=>String(x??'').trim().toUpperCase();
 const time=x=>typeof x==='string'&&x.trim()?Date.parse(x):NaN;
 const blockingStates=new Set(['confirmed','active','operational','locked']);
 return aircraft.map(a=>{
  const issues=[];
  const legs=flights.filter(f=>f.aircraft_id===a.id).sort((x,y)=>time(x.departure_at)-time(y.departure_at));
  let lastArrival=null,lastEnds=null;
  const seen=new Set();
  if(!dataComplete)issues.push({code:'DATA_INCOMPLETE',detail:'Quellen unvollständig oder limitiert'});
  if(a.operational_status!=='available')issues.push({code:'NOT_AVAILABLE',detail:'Flugzeugstatus nicht verfügbar'});
  if(!fmt(a.current_icao))issues.push({code:'POSITION_UNVERIFIED',detail:'Aktuelle Aircraft-Position nicht bestätigt'});
  for(const leg of legs){
   const start=time(leg.departure_at),end=time(leg.arrival_at);
   const origin=fmt(leg.departure_icao),destination=fmt(leg.arrival_icao);
   const tag=leg.id??'unknown';
   if(seen.has(tag)){issues.push({code:'DUPLICATE_LEG',detail:'Flugplanentwurf doppelt'});continue;}
   seen.add(tag);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!origin||!destination){
    issues.push({code:'INVALID_LEG',detail:'Ungültige Zeit oder Route'});continue;
   }
   if(/citation\s+longitude/i.test(a.aircraft_type)&&(origin==='EDAZ'||destination==='EDAZ')){
    issues.push({code:'EDAZ_LONGITUDE_RESTRICTED',detail:'Citation Longitude: EDAZ gesperrt, auch für Ferry'});
   }
   if(lastEnds!==null){
    if(start<lastEnds)issues.push({code:'LEG_OVERLAP',detail:'Zeitüberschneidung zweier Legs'});
    else if(start-lastEnds<minutes)issues.push({code:'TURNAROUND_SHORT',detail:'Turnaround unter '+minTurnMinutes+' Minuten'});
    if(origin!==lastArrival)issues.push({code:'FERRY_REQUIRED',detail:'Verbindung '+lastArrival+' → '+origin+' nicht belegt; Ferry muss separat geplant werden'});
   }else if(fmt(a.current_icao)&&origin!==fmt(a.current_icao)){
    issues.push({code:'INITIAL_FERRY_UNVERIFIED',detail:'Positionierung '+fmt(a.current_icao)+' → '+origin+' ungeprüft'});
   }
   if(reservations.some(r=>r.aircraft_id===a.id&&blockingStates.has(r.state)
       &&Number.isFinite(time(r.starts_at))&&Number.isFinite(time(r.ends_at))
       &&start<time(r.ends_at)&&time(r.starts_at)<end)){
    issues.push({code:'RESERVATION_CONFLICT',detail:'Reservierung überschneidet Flugplanentwurf'});
   }
   lastArrival=destination;
   lastEnds=end;
  }
  return {aircraftId:a.id,registration:a.registration,legCount:legs.length,issues,
   state:'review',releaseAllowed:false,
   summary:issues.length?issues.length+' offene Hinweise':'Keine bekannten Konflikte; Freigaben weiterhin offen'};
 });
}
