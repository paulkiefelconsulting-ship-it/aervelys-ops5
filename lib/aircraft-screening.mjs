/**
 * Conservative, read-only aircraft pre-screen for a fictional charter.
 * Deliberately DOES NOT assert performance, seat capacity, airworthiness,
 * crew qualifications, airport permissions, or operational release.
 */
const icao=value=>String(value??'').trim().toUpperCase();
const time=value=>Date.parse(value??'');
const validTime=value=>Number.isFinite(time(value));
const activeStates=new Set(['confirmed','active','operational','locked']);
export function screenAircraftForCharter({request,aircraft=[],reservations=[],dataComplete=true}={}){
 if(!request||!icao(request.departure_icao)||!icao(request.arrival_icao)||!validTime(request.departure_at))
  return [];
 const from=icao(request.departure_icao),to=icao(request.arrival_icao);
 const departure=time(request.departure_at);
 return aircraft.map(a=>{
  const issues=[];
  const registration=String(a.registration??'');
  const type=String(a.aircraft_type??'');
  const pos=icao(a.current_icao);
  const isLongitude=/citation\s+longitude/i.test(type);
  if(isLongitude&&(from==='EDAZ'||to==='EDAZ'||pos==='EDAZ'))
   issues.push({code:'EDAZ_LONGITUDE_RESTRICTED',label:'Longitude: EDAZ ist gesperrt (auch Ferry)',kind:'blocked'});
  if(a.operational_status!=='available')
   issues.push({code:'AIRCRAFT_NOT_AVAILABLE',label:'Status nicht als verfügbar hinterlegt',kind:'blocked'});
  if(!pos)issues.push({code:'POSITION_UNKNOWN',label:'Aktuelle Aircraft-Position nicht belegt',kind:'unverified'});
  else if(pos!==from)issues.push({code:'FERRY_UNVERIFIED',label:'Positionierungsflug muss gesondert geprüft werden',kind:'unverified'});
  const overlapping=reservations.some(r=>r.aircraft_id===a.id&&activeStates.has(r.state)
    &&validTime(r.starts_at)&&validTime(r.ends_at)
    &&time(r.starts_at)<=departure&&time(r.ends_at)>departure);
  if(overlapping)issues.push({code:'EXISTING_RESERVATION',label:'Aircraft zum Abflugzeitpunkt bereits reserviert',kind:'blocked'});
  if(!dataComplete)issues.push({code:'DATA_INCOMPLETE',label:'Flottendaten oder Reservierungen unvollständig',kind:'unverified'});
  // Even a machine with no known blockers cannot yet be released.
  // Aircraft performance, seat capacity, complete time window and PIC/SIC
  // verifications have not been authoritatively checked.
  issues.push({code:'OPERATIONS_NOT_VERIFIED',label:'Performance, Kapazität, Crew, Duty/Rest und vollständige Zeitprüfung offen',kind:'unverified'});
  return {id:a.id,registration,type,currentIcao:pos||null,
   status:issues.some(x=>x.kind==='blocked')?'blocked':'review',
   issues};
 }).sort((a,b)=>Number(a.status==='blocked')-Number(b.status==='blocked')
    ||a.registration.localeCompare(b.registration));
}
