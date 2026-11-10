/**
 * Combined, read-only PIC/SIC preview across currently planned synthetic flights.
 * No bookings, roster writes, pilot qualification assertions or crew releases.
 * Existing assignments take precedence; draft suggestions remain hypothetical.
 */
const time=x=>typeof x==='string'&&x.trim()?Date.parse(x):NaN;
const airport=x=>typeof x==='string'?x.trim().toUpperCase():'';
const MINUTE=60_000;

const validCandidate=(candidate,flight,plan)=>{
 if(!candidate||candidate.issue!==null||
  typeof candidate.id!=='string'||!candidate.id||
  !Number.isFinite(Number(candidate.costEur))||Number(candidate.costEur)<0||
  !Number.isFinite(time(candidate.startsAt))||
  !Number.isFinite(time(candidate.reportAt))||
  !Number.isFinite(time(flight.departureAt))||
  !Number.isFinite(time(flight.arrivalAt))||
  time(flight.arrivalAt)<=time(flight.departureAt)||
  time(candidate.startsAt)>time(candidate.reportAt)||
  time(candidate.reportAt)>=time(flight.departureAt)||
  time(candidate.reportAt)!==time(plan.reportAt)||
  airport(candidate.toIcao)!==airport(plan.boardingIcao))return false;
 const origin=airport(candidate.fromIcao);
 return /^[A-Z0-9]{4}$/.test(origin);
};

const allowedAfter=(candidate,previous,minimumRestMinutes)=>{
 const previousArrival=time(previous.arrivalAt);
 const journey=time(candidate.startsAt);
 return Number.isFinite(previousArrival)&&Number.isFinite(journey)&&
  journey>=previousArrival+minimumRestMinutes*MINUTE&&
  airport(candidate.fromIcao)===airport(previous.arrivalIcao);
};

/**
 * Greedy chronological multi-flight draft:
 * - never displaces previously saved crew assignments;
 * - attempts the cheapest valid PIC/SIC pair, with deterministic tie-breaks;
 * - can reuse a purely *proposed* pilot after the conservative rest period,
 *   only when the previous hypothetical destination matches the next origin;
 * - never treats the result as a flight, travel or crew authorization.
 */
export function proposeShadowCrewDispatch({
 flights=[],plans=[],assignments=[],minimumRestMinutes=690
}={}){
 if(!Number.isFinite(minimumRestMinutes)||minimumRestMinutes<0)
  throw new TypeError('Invalid virtual rest buffer');
 const futureFlights=flights.filter(f=>f.status==='planned').sort((a,b)=>
  time(a.departureAt)-time(b.departureAt)||String(a.id).localeCompare(String(b.id)));
 const planById=new Map(plans.map(p=>[p.flightId,p]));
 const fixedByFlight=new Map();
 const reserved=new Map();
 for(const assignment of assignments){
  if(!futureFlights.some(f=>f.id===assignment.shadowFlightId))continue;
  const fixed=fixedByFlight.get(assignment.shadowFlightId)||[];
  fixed.push(assignment);
  fixedByFlight.set(assignment.shadowFlightId,fixed);
  const linked=reserved.get(assignment.employeeId)||new Set();
  linked.add(assignment.shadowFlightId);
  reserved.set(assignment.employeeId,linked);
 }
 const proposed=new Map();
 const output=[];
 for(const flight of futureFlights){
  const plan=planById.get(flight.id);
  const fixed=fixedByFlight.get(flight.id)||[];
  const fixedPic=fixed.filter(a=>a.role==='PIC');
  const fixedSic=fixed.filter(a=>a.role==='SIC');
  const base={flightId:flight.id,from:airport(flight.departureIcao),
   to:airport(flight.arrivalIcao),departureAt:flight.departureAt,
   lockedSeats:fixed.length,reportAt:plan?.reportAt??null,
   status:'blocked',reason:null,pic:null,sic:null,costEur:null};
  if(fixedPic.length>1||fixedSic.length>1||fixed.some(a=>!['PIC','SIC'].includes(a.role))){
   output.push({...base,reason:'DUPLICATE_SAVED_CREW_ASSIGNMENT'});continue;
  }
  if(fixed.some(a=>(reserved.get(a.employeeId)?.size??0)>1)){
   output.push({...base,reason:'CONFLICTING_SAVED_CREW_ASSIGNMENTS'});continue;
  }
  if(!plan||plan.status!=='scenario_proposal'){
   output.push({...base,reason:plan?.issue||'SCENARIO_NOT_READY'});continue;
  }
  const available=role=>(plan.candidates?.[role]||[]).filter(candidate=>
   validCandidate(candidate,flight,plan)&&
   (!fixed.length||!fixed.some(a=>a.role===role)||
    fixed.some(a=>a.role===role&&a.employeeId===candidate.id))&&
   !(reserved.get(candidate.id)?.size>0&&!reserved.get(candidate.id)?.has(flight.id))&&
   (proposed.get(candidate.id)||[]).every(previous=>
    allowedAfter(candidate,previous,minimumRestMinutes)));
  const pics=available('PIC').filter(c=>!fixedPic.length||c.id===fixedPic[0].employeeId);
  const sics=available('SIC').filter(c=>!fixedSic.length||c.id===fixedSic[0].employeeId);
  const combinations=pics.flatMap(pic=>sics.filter(sic=>sic.id!==pic.id)
   .map(sic=>({pic,sic,cost:Number(pic.costEur)+Number(sic.costEur)})));
  combinations.sort((a,b)=>a.cost-b.cost||a.pic.id.localeCompare(b.pic.id)||
   a.sic.id.localeCompare(b.sic.id));
  const best=combinations[0];
  if(!best){
   output.push({...base,reason:'NO_CONFLICT_FREE_CREW_PAIR'});continue;
  }
  for(const member of [best.pic,best.sic]){
   const previous=proposed.get(member.id)||[];
   previous.push({flightId:flight.id,arrivalAt:flight.arrivalAt,
    arrivalIcao:flight.arrivalIcao});
   proposed.set(member.id,previous);
  }
  output.push({...base,status:'proposal',reason:null,
   pic:best.pic,sic:best.sic,costEur:best.cost});
 }
 return output;
}
